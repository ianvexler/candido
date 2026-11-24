"use client";

import { Dialog } from "radix-ui";
import { useState } from "react";
import { Button } from "../ui/Button";

interface ConfirmationModalProps {
  isOpen: boolean;
  /** Called when the prompt is dismissed, and after confirming. */
  onClose: () => void;
  /** The cancel button, when it does more than dismiss the prompt (e.g. Discard). */
  onCancel?: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  /** Where focus goes once closed, when what had it before is gone. */
  onCloseAutoFocus?: (event: Event) => void;
}

const ConfirmationModal = ({
  isOpen,
  onClose,
  onCancel = onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onCloseAutoFocus,
}: ConfirmationModalProps) => {
  // Held while confirming, so a second click can't run it twice.
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-100 bg-black/50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-101 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-lg"
          onPointerDownOutside={onClose}
          onEscapeKeyDown={onClose}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <Dialog.Title asChild>
            <h2 className="text-lg font-semibold">{title}</h2>
          </Dialog.Title>

          {description && (
            <Dialog.Description asChild>
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            </Dialog.Description>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={confirming}>
              {cancelLabel}
            </Button>
          
            <Button
              type="button"
              variant={variant === "destructive" ? "destructive" : "default"}
              onClick={handleConfirm}
              disabled={confirming}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default ConfirmationModal;