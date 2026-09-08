"""Regression contracts for the real dump/restore/count CLI, without a DB."""
import importlib.util
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('db_move', Path(__file__).resolve().parents[2] / 'infra/db-move.py')
move = importlib.util.module_from_spec(spec)
spec.loader.exec_module(move)


class DbMoveTests(unittest.TestCase):
    def test_environment_configuration_never_reads_dotenv(self):
        with patch.dict(os.environ, {'RESTORE_TEST_URL': 'postgresql://test:test@localhost/test'}), patch.object(
            move, 'read_env', side_effect=AssertionError('must not read .env')
        ):
            self.assertEqual(move.url_for('RESTORE_TEST_URL'), os.environ['RESTORE_TEST_URL'])

    def test_restore_failure_exits_nonzero_and_targets_url_database(self):
        failure = subprocess.CompletedProcess([], 1, '', 'private COPY row')
        with patch.object(move, 'url_for', return_value='postgresql://test:test@localhost/restore_target'), patch.object(
            move, 'run', return_value=failure
        ) as run:
            with self.assertRaises(SystemExit):
                move.cmd_restore('RESTORE_TEST_URL', 'synthetic.dump')
        args = run.call_args.args[1]
        self.assertIn('--exit-on-error', args)
        self.assertIn('--single-transaction', args)
        self.assertEqual(args[args.index('--dbname') + 1], 'restore_target')

    def test_counts_are_exact_and_errors_fail(self):
        self.assertNotIn('n_live_tup', move.SQL_COUNTS)
        self.assertIn('count(*)', move.SQL_COUNTS.lower())
        with patch.object(move, 'url_for', return_value='postgresql://test:test@localhost/test'), patch.object(
            move, 'run', return_value=subprocess.CompletedProcess([], 1, '', 'failure')
        ):
            with self.assertRaises(SystemExit):
                move.cmd_counts('RESTORE_TEST_URL')

    def test_local_sslmode_and_credentials_stay_in_environment(self):
        env = move.pg_env('postgresql://user:p%40ss@localhost:5432/fixture?sslmode=disable')
        self.assertEqual(env['PGPASSWORD'], 'p@ss')
        self.assertEqual(env['PGDATABASE'], 'fixture')
        self.assertEqual(env['PGSSLMODE'], 'disable')
        self.assertEqual(move.pg_env('postgresql://user:pw@remote/db')['PGSSLMODE'], 'require')


if __name__ == '__main__':
    unittest.main()
