import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

interface GameDialogProps {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  /** Extra classes for the content panel */
  className?: string;
  /** z-index class, defaults to z-30 */
  zIndex?: string;
}

/**
 * Accessible modal wrapper using Radix Dialog.
 * Provides focus trapping, Escape-to-close, and proper ARIA attributes.
 * All game dialogs (discard, monopoly, year of plenty, robber steal, trade response, victory)
 * should use this instead of raw backdrop divs.
 */
export function GameDialog({ open, title, description, children, className = 'w-80', zIndex = 'z-30' }: GameDialogProps) {
  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className={`fixed inset-0 ${zIndex} bg-black/60 data-[state=open]:animate-[fadeIn_0.15s_ease-out]`} />
        <Dialog.Content
          className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${zIndex} bg-stone-800 rounded-xl p-5 shadow-xl border border-white/10 focus:outline-none ${className}`}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Dialog.Title className="font-semibold text-white text-sm mb-1">{title}</Dialog.Title>
          {description && (
            <Dialog.Description className="text-xs text-stone-400 mb-3">{description}</Dialog.Description>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
