import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2, User, Mail, Phone, Building2, Hash, FileText, UserRound, Lock } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "./../components/Header";
import { useEmployeeAuth } from "../../../contexts/EmployeeAuthContext";
import employeeApi from "../../../lib/employeeApi";
import { getInitials } from "../../../utils/getInitials";
import { getProfileImageUrl } from "../../../utils/getImageUrl";
import type { EmployeeUser } from "../../../types/Employee";
import { uploadApi, uploadPutHeaders } from "../../../lib/uploadApi";

const MAX_SIZE_MB = 2;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const DISPLAY = "font-['Bricolage_Grotesque',sans-serif]";
const CARD = "rounded-[18px] border border-[#DCE2E8] bg-white p-5";
const ALERT = "rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600";
const FIELD = "w-full rounded-xl border border-[#DCE2E8] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#6A55D6]";
// Server-managed fields read the same as the editable ones but cannot be typed in.
const LOCKED = "w-full cursor-not-allowed rounded-xl border border-[#DCE2E8] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#667385] outline-none";
const LABEL = "mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[#667385]";

type ManagerFormData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  employeeCode: string;
  joinDate: string;
  bio: string;
  imageUrl: string;
};

const EMPTY: ManagerFormData = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  department: "",
  designation: "",
  employeeCode: "",
  joinDate: "",
  bio: "",
  imageUrl: "",
};

const dateLabel = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const toFormData = (employee: EmployeeUser | null): ManagerFormData => {
  if (!employee) return EMPTY;
  return {
    firstName: employee.firstName ?? "",
    lastName: employee.lastName ?? "",
    email: employee.email ?? "",
    phone: employee.phone ?? "",
    department: employee.department ?? "",
    designation: employee.designation ?? "",
    employeeCode: employee.employeeCode ?? "",
    joinDate: dateLabel(employee.job?.joinDate),
    bio: employee.profile?.bio ?? "",
    imageUrl: employee.profile?.imageUrl ?? "",
  };
};

const ManagerProfile: React.FC = () => {
  const { refreshEmployee } = useEmployeeAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [formData, setFormData] = useState<ManagerFormData>(EMPTY);
  const [initialFormData, setInitialFormData] = useState<ManagerFormData>(EMPTY);
  const [previewLink, setPreviewLink] = useState("");
  const [localPreview, setLocalPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [imageLoading, setImageLoading] = useState<"upload" | "remove" | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const res = await employeeApi.get<{ employee: EmployeeUser }>("/me");
      const next = toFormData(res.data?.employee ?? null);
      setFormData(next);
      setInitialFormData(next);
      setLocalPreview("");
      setPreviewLink(next.imageUrl ? await getProfileImageUrl(next.imageUrl) : "");
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isFormChanged = JSON.stringify(formData) !== JSON.stringify(initialFormData);
  const avatar = localPreview || previewLink;

  const handleChange = (field: keyof ManagerFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const uploadImage = async (file: File) => {
    const { data } = await uploadApi.post("/get-upload-url", {
      fileName: file.name,
      fileType: file.type,
      folderMain: "managers",
    });

    const response = await fetch(data.uploadUrl, {
      method: "PUT",
      body: file,
      headers: uploadPutHeaders(file.type || "application/octet-stream"),
    });

    if (!response.ok) throw new Error("Image upload failed");

    return data.key as string;
  };

  // The picture is persisted on its own rather than waiting for Save Changes, so
  // picking an image immediately updates the backend and the header. The previous
  // object is deleted from R2 too, otherwise every replacement leaks a file.
  const persistPicture = async (nextKey: string) => {
    const previousKey = formData.imageUrl;
    const res = await employeeApi.put<{ employee: EmployeeUser }>("/me", { imageUrl: nextKey });

    const next = toFormData(res.data?.employee ?? null);
    setFormData(next);
    setInitialFormData(next);
    setLocalPreview("");
    setPreviewLink(next.imageUrl ? await getProfileImageUrl(next.imageUrl) : "");

    await refreshEmployee().catch(() => null);

    if (previousKey && previousKey !== nextKey) {
      uploadApi
        .delete("/delete-file", { data: { fileKey: previousKey } })
        .catch(() => null);
    }
  };

  const handlePictureSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Only JPG, PNG or WebP files are allowed.");
      return;
    }

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Max file size is ${MAX_SIZE_MB}MB.`);
      return;
    }

    try {
      setError("");
      setSuccess("");
      setImageLoading("upload");

      const preview = URL.createObjectURL(file);
      setLocalPreview(preview);

      const finalKey = await uploadImage(file);

      try {
        await persistPicture(finalKey);
        setSuccess("Profile picture updated successfully!");
      } catch (err: any) {
        // The object reached R2 but the profile write failed, so roll the local
        // state back rather than showing a picture the backend does not have.
        URL.revokeObjectURL(preview);
        setLocalPreview("");
        setError(err.response?.data?.message || "Could not save your profile picture.");
      }
    } catch (err) {
      console.error("Upload failed", err);
      setError("Failed to upload image.");
    } finally {
      setImageLoading(null);
    }
  };

  const handleRemovePicture = async () => {
    const previousKey = formData.imageUrl;
    if (!previousKey) return;

    try {
      setError("");
      setSuccess("");
      setImageLoading("remove");
      await persistPicture("");
      setSuccess("Profile picture removed.");
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not remove your profile picture.");
    } finally {
      setImageLoading(null);
    }
  };

  const handleCancel = () => {
    setFormData(initialFormData);
    setLocalPreview("");
    setError("");
    setSuccess("");
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      // Only the fields PUT /me accepts; name, email and employee code are
      // server-managed, and department/designation are admin-only.
      const res = await employeeApi.put<{ employee: EmployeeUser }>("/me", {
        phone: formData.phone.trim(),
        bio: formData.bio.trim(),
        imageUrl: formData.imageUrl,
      });

      const next = toFormData(res.data?.employee ?? null);
      setFormData(next);
      setInitialFormData(next);
      setLocalPreview("");
      setPreviewLink(next.imageUrl ? await getProfileImageUrl(next.imageUrl) : "");

      // Keep the header in sync without a full reload.
      await refreshEmployee().catch(() => null);

      setSuccess("Profile updated successfully!");
    } catch (err: any) {
      console.error("Failed to update profile", err);
      setError(err.response?.data?.message || "Failed to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#EDF0F3] text-[#121C2B]">
      <div className="mx-auto max-w-[1240px] px-5 pb-10 pt-5">
        <Sidebar active="profile" />
        <Header />

        {success && (
          <p className="mb-3 rounded-lg bg-[#F4F6F8] px-3 py-2 text-xs font-medium text-[#0E9F8B]">{success}</p>
        )}

        {error && <p className={`${ALERT} mb-3`}>{error}</p>}

        {loading ? (
          <p className={`${CARD} flex items-center gap-2 text-sm text-[#667385]`}>
            <Loader2 size={16} className="animate-spin" />
            Loading your profile…
          </p>
        ) : (
          <>
            {/* Profile picture */}
            <section aria-label="Profile picture" className={`${CARD} flex flex-col items-center gap-5 sm:flex-row sm:items-start`}>
              <div className="flex shrink-0 flex-col items-center gap-2">
                <div className="relative">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-[3px] border-[#6A55D6] bg-[#F4F6F8] text-lg font-bold text-[#6A55D6]">
                    {avatar ? (
                      <img
                        src={avatar}
                        alt="Profile"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      getInitials(`${formData.firstName} ${formData.lastName}`.trim())
                    )}
                  </div>

                  <button
                    type="button"
                    aria-label="Change profile picture"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={imageLoading !== null}
                    className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#6A55D6] text-white transition hover:bg-[#5a47bd] disabled:opacity-50"
                  >
                    {imageLoading === "upload" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Camera size={14} />
                    )}
                  </button>
                </div>

                <small className="text-xs text-[#667385]">JPG, PNG or WebP</small>
                <small className="-mt-1 text-xs text-[#667385]">Max size {MAX_SIZE_MB}MB</small>
              </div>

              <div className="min-w-0 flex-1">
                <h2 className={`${DISPLAY} text-[17px] font-bold`}>Profile picture</h2>
                <p className="mb-3 mt-1 text-sm text-[#667385]">
                  You can add, change, or remove your profile picture from here
                  anytime.
                </p>

                <button
                  type="button"
                  onClick={handleRemovePicture}
                  disabled={imageLoading !== null || !formData.imageUrl}
                  className="flex items-center gap-2 rounded-full bg-[#F4F6F8] px-4 py-2 text-sm font-semibold text-[#E4484D] transition hover:bg-[#fbe9ea] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {imageLoading === "remove" ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Trash2 size={15} />
                  )}
                  Remove picture
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_TYPES.join(",")}
                  onChange={handlePictureSelected}
                  className="hidden"
                />
              </div>
            </section>

            {/* Profile information */}
            <section aria-label="Profile information" className={`${CARD} mt-4`}>
              <div className="flex items-center gap-2">
                <User size={18} className="text-[#6A55D6]" />
                <h3 className={`${DISPLAY} text-[17px] font-bold`}>Profile information</h3>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className={LABEL}>
                  First name
                  <input
                    type="text"
                    value={formData.firstName}
                    disabled
                    className={`${LOCKED} mt-1`}
                  />
                </label>

                <label className={LABEL}>
                  Last name
                  <input
                    type="text"
                    value={formData.lastName}
                    disabled
                    className={`${LOCKED} mt-1`}
                  />
                </label>

                <label className={LABEL}>
                  <Mail size={13} /> Email
                  <input
                    type="email"
                    value={formData.email}
                    disabled
                    className={`${LOCKED} mt-1`}
                  />
                </label>

                <label className={LABEL}>
                  <Phone size={13} /> Phone
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    placeholder="Enter phone number"
                    className={`${FIELD} mt-1`}
                  />
                </label>

                <label className={LABEL}>
                  <Building2 size={13} /> Department
                  <span className="flex items-center gap-1 rounded-full bg-[#F4F6F8] px-2 py-0.5 text-[10px] font-medium text-[#667385]">
                    <Lock size={9} /> Admin only
                  </span>
                  <input
                    type="text"
                    value={formData.department}
                    readOnly
                    placeholder="Set by admin"
                    className={`${LOCKED} mt-1`}
                  />
                </label>

                <label className={LABEL}>
                  <UserRound size={13} /> Designation
                  <span className="flex items-center gap-1 rounded-full bg-[#F4F6F8] px-2 py-0.5 text-[10px] font-medium text-[#667385]">
                    <Lock size={9} /> Admin only
                  </span>
                  <input
                    type="text"
                    value={formData.designation}
                    readOnly
                    placeholder="Set by admin"
                    className={`${LOCKED} mt-1`}
                  />
                </label>

                <label className={LABEL}>
                  <Hash size={13} /> Employee ID
                  <input
                    type="text"
                    value={formData.employeeCode}
                    disabled
                    placeholder="e.g. MGR001"
                    className={`${LOCKED} mt-1`}
                  />
                </label>

                <label className={LABEL}>
                  Join date
                  <input
                    type="text"
                    value={formData.joinDate}
                    disabled
                    className={`${LOCKED} mt-1`}
                  />
                </label>

                <label className={`${LABEL} sm:col-span-2`}>
                  <FileText size={13} /> Bio
                  <textarea
                    value={formData.bio}
                    onChange={(e) => handleChange("bio", e.target.value)}
                    placeholder="Write a short bio..."
                    rows={3}
                    className={`${FIELD} mt-1 resize-none`}
                  />
                </label>
              </div>

              <p className="mt-4 text-xs text-[#667385]">
                Name, email and employee ID are maintained by the HR admin and cannot be edited here.
              </p>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!isFormChanged || saving}
                  className="rounded-full bg-[#6A55D6] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5a47bd] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>

                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={!isFormChanged || saving}
                  className="rounded-full border border-[#DCE2E8] px-6 py-2.5 text-sm font-semibold text-[#667385] transition hover:text-[#121C2B] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default ManagerProfile;