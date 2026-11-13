import React, { useState } from "react";
import { ShieldCheck, Lock } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import {
  PasswordInputField,
  PasswordRequirementsChecklist,
  UpdatePasswordButton,
} from "../../StudentDashboard/components/PasswordSettingsControls";
import { useChangePassword } from "../../../hooks/useChangePassword";

const DISPLAY = "font-['Bricolage_Grotesque',sans-serif]";
const CARD = "rounded-[18px] border border-[#DCE2E8] bg-white p-5";

const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/;

const EmployeePasswordSettings: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const {
    changePassword,
    loading,
    error,
    success,
  } = useChangePassword();

  const isPasswordValid = PASSWORD_REGEX.test(newPassword);
  const canSubmit =
    currentPassword.length > 0 &&
    isPasswordValid &&
    confirmPassword.length > 0 &&
    !loading;

  const handleSubmit = async () => {
    setValidationError(null);

    if (newPassword === currentPassword) {
      setValidationError(
        "New password cannot be the same as your current password."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setValidationError("New password and confirm password do not match.");
      return;
    }

    // Only clear the boxes once the change actually landed, otherwise a rejected
    // attempt wipes what the user typed and leaves them with nothing to retry.
    const saved = await changePassword(currentPassword, newPassword);

    if (saved) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  return (
    <div className="min-h-screen bg-[#EDF0F3] text-[#121C2B]">
      <div className="mx-auto max-w-[1240px] px-5 pb-10 pt-5">
        <Sidebar active="settings" />
        <Header />

        <section aria-label="Password settings" className="mt-4">
          <div className="flex items-start gap-3">
            <ShieldCheck size={22} className="mt-1 shrink-0 text-[#6A55D6]" />
            <h1 className={`${DISPLAY} text-[clamp(24px,3.4vw,36px)] font-bold leading-[1.1] tracking-tight`}>
              Password settings
            </h1>
          </div>
          <p className="mb-4 mt-2 text-[#667385]">
            Manage your password and keep your account secure.
          </p>
        </section>

        <section aria-label="Change password" className={`${CARD} mt-4`}>
          <div className="mb-1 flex items-center gap-1.5">
            <Lock size={16} className="text-[#6A55D6]" />
            <h2 className={`${DISPLAY} text-[17px] font-bold`}>Change password</h2>
          </div>

          <p className="mb-4 text-[#667385]">
            Use a strong password you don't use elsewhere.
          </p>

          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,680px)_1fr]">
            <div className="flex flex-col gap-3">
              <PasswordInputField
                label="Current Password"
                placeholder="Enter your current password"
                value={currentPassword}
                onChange={setCurrentPassword}
              />

              <PasswordInputField
                label="New Password"
                placeholder="Enter your new password"
                value={newPassword}
                onChange={setNewPassword}
              />

              <PasswordInputField
                label="Confirm New Password"
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={setConfirmPassword}
              />

              {validationError && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{validationError}</p>
              )}
              {error && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{error}</p>
              )}
              {success && (
                <p className="rounded-lg bg-[#F4F6F8] px-3 py-2 text-xs font-medium text-[#0E9F8B]">
                  Password updated successfully.
                </p>
              )}

              <div className="mt-1">
                <UpdatePasswordButton
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  loading={loading}
                />
              </div>
            </div>

            <div className="flex justify-center lg:pt-0">
              <PasswordRequirementsChecklist password={newPassword} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default EmployeePasswordSettings;