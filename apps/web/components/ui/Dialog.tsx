'use client';

import type { ReactNode } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Optional muted line under the title. */
  description?: string;
  children: ReactNode;
}

/**
 * Modal dialog on Radix: focus trap, Esc-to-close, focus restore and
 * aria-labelling come from the primitive; the shell classes live in
 * globals.css (`.dialog-overlay`, `.dialog-content`).
 */
export function Dialog({ open, onOpenChange, title, description, children }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog-overlay" />
        <RadixDialog.Content className="dialog-content stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <RadixDialog.Title className="dialog-title">{title}</RadixDialog.Title>
            <RadixDialog.Close className="btn ghost" aria-label="Close">
              <X size={16} aria-hidden />
            </RadixDialog.Close>
          </div>
          {description ? (
            <RadixDialog.Description className="muted" style={{ fontSize: 13, margin: 0 }}>
              {description}
            </RadixDialog.Description>
          ) : null}
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
