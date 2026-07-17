'use client';

import { X } from 'lucide-react';
import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}

/** Accessible modal (focus trap + Esc-to-close + backdrop click) on top of hand-rolled tokens. */
export function Dialog({ open, onOpenChange, title, description, children }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog-overlay" />
        <RadixDialog.Content className="dialog-content card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <RadixDialog.Title style={{ margin: 0, fontWeight: 600 }}>{title}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <button className="btn ghost" aria-label="Close" style={{ padding: 4 }}>
                <X size={16} />
              </button>
            </RadixDialog.Close>
          </div>
          {description && (
            <RadixDialog.Description className="muted" style={{ fontSize: 13 }}>
              {description}
            </RadixDialog.Description>
          )}
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
