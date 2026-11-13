import React, { useEffect, useState } from "react";
import { Loader2, Pencil, Quote } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";

interface StudentBioProps {
  bio: string;
  onSaved: (bio: string) => void;
  onError: (message: string) => void;
}

const StudentBio: React.FC<StudentBioProps> = ({
  bio,
  onSaved,
  onError,
}) => {
  const { updateProfile } = useAuth() as {
    updateProfile: (payload: any) => Promise<any>;
  };

  const [isEditing, setIsEditing] = useState(false);
  const [draftBio, setDraftBio] = useState(bio || "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setDraftBio(bio || "");
    }
  }, [bio, isEditing]);

  const handleEdit = () => {
    setDraftBio(bio || "");
    setIsEditing(true);
    onError("");
  };

  const handleSave = async () => {
    const trimmedBio = draftBio.trim();

    setLoading(true);
    onError("");

    try {
      const result = await updateProfile({
        profile: {
          bio: trimmedBio,
        },
      });

      if (!result?.success) {
        onError(
          result?.error || "Failed to update bio",
        );
        return;
      }

      setDraftBio(trimmedBio);
      setIsEditing(false);
      onSaved(trimmedBio);
    } catch (error) {
      console.error("Bio update failed:", error);
      onError("Failed to update bio");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full bg-white rounded-[32px] border-[1px] border-solid border-gray-200 shadow-[0_4px_18px_rgba(0,0,0,0.12)] p-3 sm:px-10 sm:py-8 min-w-0">
      {/* Heading */}
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">
          Student Bio
        </h2>

        <p className="text-sm text-gray-500 mt-2">
          Share a short bio, your goals, and the topics you want to learn.
        </p>
      </div>

      {/* Bio */}
      <div className="w-full sm:max-w-3xl lg:max-w-4xl mx-auto">
        <div className="relative w-full">
          {/* Top Quote */}
          <Quote
            className="absolute -top-3 left-4 z-10 text-[#1143A3] -scale-x-100 pointer-events-none"
            size={28}
            strokeWidth={2.8}
          />

          <textarea
            value={draftBio}
            onChange={(e) => {
              setDraftBio(e.target.value);
            }}
            disabled={!isEditing}
            maxLength={500}
            rows={5}
            placeholder="Update About"
            className={`w-full h-[150px] px-6 pt-8 pb-8 rounded-xl border-l-4 border-blue-600 text-sm text-gray-700 resize-none transition-[background-color,border-color,box-shadow] duration-150 focus:outline-none ${
              isEditing
                ? "bg-white border-[1px] border-solid border-gray-200 border-l-blue-600 focus:ring-1 focus:ring-blue-500"
                : "bg-gradient-to-br from-blue-50 to-blue-100/40 cursor-not-allowed"
            }`}
          />

          {/* Bottom Quote */}
          <Quote
            className="absolute -bottom-3 right-4 z-10 text-[#1143A3] pointer-events-none"
            size={28}
            strokeWidth={2.8}
          />
        </div>

        {/* Character Count */}
        <div className="mt-4 lg:mt-7 flex items-center justify-between px-1">
          <span className="text-[11px] text-blue-500">
            Give your bio under 500 words
          </span>

          <span className="text-[11px] text-gray-400 whitespace-nowrap">
            {draftBio.length}/500
          </span>
        </div>
      </div>

      {/* Button */}
      <div className="flex justify-center mt-6">
        <button
          type="button"
          onClick={
            isEditing ? handleSave : handleEdit
          }
          disabled={loading}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#02277a] text-white rounded-lg hover:bg-blue-800 font-medium text-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {loading && isEditing ? (
            <Loader2
              size={16}
              className="animate-spin"
            />
          ) : !isEditing ? (
            <Pencil size={16} />
          ) : null}

          {isEditing ? "Save Bio" : "Edit Bio"}
        </button>
      </div>
    </div>
  );
};

export default StudentBio;