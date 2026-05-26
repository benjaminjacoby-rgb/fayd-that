"use client";

import { useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/Button";
import {
  isUsernameAvailable,
  updateProfile,
  uploadAvatar,
} from "@/lib/data/profileClient";
import { fullName } from "@/lib/format";
import type { UserRow } from "@/types/db";

interface Props {
  me: UserRow;
  onClose: () => void;
  onSaved: (patch: { fullName: string; username: string; avatarUrl: string | null }) => void;
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

export function EditProfileSheet({ me, onClose, onSaved }: Props) {
  const [displayName, setDisplayName] = useState(fullName(me));
  const [username, setUsername] = useState(me.username ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(me.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please pick an image file");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("Image must be under 5 MB");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const url = await uploadAvatar(file);
      setAvatarUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload image");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setError(null);
    const trimmedName = displayName.trim();
    const trimmedUsername = username.trim();
    if (!trimmedName) {
      setError("Display name can't be empty");
      return;
    }
    if (!trimmedUsername) {
      setError("Username can't be empty");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      setError("Username can only contain letters, numbers, and underscores");
      return;
    }
    setSaving(true);
    try {
      // Skip the availability check if the username didn't change.
      if (trimmedUsername.toLowerCase() !== (me.username ?? "").toLowerCase()) {
        const ok = await isUsernameAvailable(trimmedUsername, me.id);
        if (!ok) {
          setError("That username is taken");
          setSaving(false);
          return;
        }
      }
      await updateProfile({
        fullName: trimmedName,
        username: trimmedUsername,
        avatarUrl,
      });
      onSaved({ fullName: trimmedName, username: trimmedUsername, avatarUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-app bg-bg2 rounded-t-2xl shadow-2xl px-5 pt-2 pb-6 max-h-[90vh] flex flex-col overflow-y-auto">
        <div className="flex justify-center mb-2">
          <div className="h-1 w-10 rounded-pill bg-bg4" />
        </div>
        <h2 className="text-lg font-bold mb-4">Edit profile</h2>

        {/* Photo */}
        <div className="flex items-center gap-4 mb-5">
          <Avatar
            first={me.first_name}
            lastInitial={me.last_name_initial}
            color={me.avatar_color}
            imageUrl={avatarUrl}
            size={72}
          />
          <div className="flex-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePickFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-input bg-bg3 hover:bg-bg4 text-text text-sm font-medium px-3 py-2 disabled:opacity-50"
            >
              {uploading ? "Uploading…" : avatarUrl ? "Change photo" : "Upload photo"}
            </button>
            {avatarUrl ? (
              <button
                type="button"
                onClick={() => setAvatarUrl(null)}
                disabled={uploading}
                className="ml-2 text-text3 hover:text-no text-xs"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>

        {/* Display name */}
        <label className="text-xs uppercase tracking-wide text-text3 font-medium block mb-1.5">
          Display name
        </label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={60}
          placeholder="Sarah Kim"
          className="w-full bg-bg3 rounded-input px-3 py-2.5 mb-4 outline-none focus:ring-2 focus:ring-yes/40"
        />

        {/* Username */}
        <label className="text-xs uppercase tracking-wide text-text3 font-medium block mb-1.5">
          Username
        </label>
        <div className="flex items-stretch bg-bg3 rounded-input mb-4 focus-within:ring-2 focus-within:ring-yes/40">
          <span className="px-3 inline-flex items-center text-text3">@</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
            maxLength={30}
            placeholder="sarah_k"
            className="flex-1 bg-transparent py-2.5 pr-3 outline-none"
          />
        </div>

        {error ? <p className="text-no text-xs mb-3">{error}</p> : null}

        <div className="flex items-center justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={onClose} disabled={saving || uploading}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || uploading}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
