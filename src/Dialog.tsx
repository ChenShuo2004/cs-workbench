import React, { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

/** A shared modal layer: native inert background, focus containment and Escape. */
export function Dialog({
  label,
  children,
  onClose,
  dismissible = true,
  className = "",
  error,
}: {
  label: string;
  children: React.ReactNode;
  onClose: () => void;
  dismissible?: boolean;
  className?: string;
  error?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className={`app-dialog ${className}`}
      role="dialog"
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget || !dismissible) return;
        const rect = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        )
          onClose();
      }}
    >
      {error && (
        <div className="dialog-error" role="alert">
          {error}
        </div>
      )}
      {children}
    </dialog>,
    document.body,
  );
}
