"""Safety contracts for the restore drill; no database needed."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import subprocess

spec = importlib.util.spec_from_file_location('restore_backup', Path(__file__).with_name('restore_backup.py'))
drill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(drill)


class RestoreSafetyTests(unittest.TestCase):
    def test_missing_dump_fails_instead_of_skipping(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(drill.DrillError, 'No .dump'):
                drill.find_dumps(Path(directory))

    def test_counts_must_match_exactly_not_estimates_or_minimums(self):
        expected = {'tasks': 2194, 'journal_entries': 636, 'workouts': 147}
        drill.assert_counts(expected, expected)
        for wrong in [2193, 2195]:
            with self.assertRaisesRegex(drill.DrillError, 'tasks'):
                drill.assert_counts({**expected, 'tasks': wrong}, expected)
        with self.assertRaisesRegex(drill.DrillError, 'workouts'):
            drill.assert_counts({'tasks': 2194, 'journal_entries': 636}, expected)

    def test_only_existing_public_schema_creation_is_omitted(self):
        toc = '\n'.join([
            '; archive header',
            '5; 2615 2200 SCHEMA - public postgres',
            '6; 2615 2201 SCHEMA - other postgres',
            '7; 1259 100 TABLE public tasks postgres',
            '8; 0 100 TABLE DATA public tasks postgres',
        ])
        filtered = drill.restore_list(toc)
        self.assertNotIn('5; 2615', filtered)
        for line in toc.splitlines()[2:]:
            self.assertIn(line, filtered)

    def test_corrupt_or_unpinned_download_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'backup.dump'
            path.write_bytes(b'PGDMPfixture')
            with self.assertRaisesRegex(drill.DrillError, 'SHA-256'):
                drill.verify_digest(path, '')
            with self.assertRaisesRegex(drill.DrillError, 'SHA-256'):
                drill.verify_digest(path, '0' * 64)

    def test_postgres_failure_is_fatal_and_never_prints_private_rows(self):
        result = subprocess.CompletedProcess([], 1, '', 'COPY failed: PRIVATE JOURNAL BODY')
        with patch.object(drill.subprocess, 'run', return_value=result):
            with self.assertRaises(drill.DrillError) as error:
                drill.command(['docker', 'exec', 'temporary', 'pg_restore'])
        self.assertNotIn('PRIVATE', str(error.exception))

    def test_failure_still_removes_only_the_new_container_and_volume(self):
        calls = []

        def fake_command(args, **_kwargs):
            calls.append(args)
            if 'createdb' in args:
                raise drill.DrillError('restore failed')
            return ''

        with patch.object(drill, 'command', side_effect=fake_command), patch.object(
            drill.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)
        ):
            with self.assertRaises(drill.DrillError):
                drill.restore_one(Path('private.dump'), {'tasks': 2194}, 1)
        create, cleanup = calls[0], calls[-1]
        name = create[create.index('--name') + 1]
        self.assertTrue(name.startswith('atlas-restore-'))
        self.assertEqual(create[create.index('--network') + 1], 'none')
        self.assertNotIn('-p', create)
        self.assertNotIn('-v', create)
        self.assertEqual(cleanup, ['docker', 'rm', '-f', '-v', name])


if __name__ == '__main__':
    unittest.main()
