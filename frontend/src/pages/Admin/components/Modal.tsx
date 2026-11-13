import React from "react";

type ModalProps = {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
};

const FIELD =
  "mt-1 w-full rounded-xl border border-[#DCE2E8] bg-white px-3 py-2 text-sm text-[#121C2B] outline-none focus:border-[#6A55D6]";

/**
 * Shared dialog shell for the admin console's create/edit forms.
 *
 * Closes on Escape and on a backdrop click, and restores page scrolling while
 * open — a dialog left open on a filtered directory would otherwise leave the
 * body unscrollable behind the overlay.
 */
const Modal: React.FC<ModalProps> = ({ title, description, onClose, children }) => {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#121C2B]/45 p-4 sm:p-6"
      onClick={(event) => {
        // Only a click that lands on the backdrop itself dismisses, so a click
        // inside the panel — or on a select's open dropdown — cannot close it.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="my-auto w-full max-w-[620px] rounded-[18px] border border-[#DCE2E8] bg-white p-5 sm:p-6"
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="mr-auto">
            <h2 className="font-['Bricolage_Grotesque',sans-serif] text-xl font-bold">{title}</h2>
            {description && <p className="mt-1 text-sm text-[#667385]">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-[#DCE2E8] px-3 py-1 text-sm font-semibold text-[#667385] transition hover:bg-[#F4F6F8]"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const LabeledField: React.FC<{
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  hint?: string;
}> = ({ label, htmlFor, children, hint }) => (
  <div>
    <label htmlFor={htmlFor} className="block text-sm font-medium text-[#121C2B]">
      {label}
      {hint && <span className="ml-2 font-normal text-[#667385]">{hint}</span>}
    </label>
    {children}
  </div>
);

export const inputClass = FIELD;

export default Modal;