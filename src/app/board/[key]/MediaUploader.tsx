"use client";

import { useState, useRef, useCallback } from "react";
import { getMediaType, type MediaItem } from "@/lib/types";

interface MediaUploaderProps {
  roomKey: string;
  uploadedBy: string;
  onUploadComplete: (mediaItem: MediaItem) => void;
  onClose: () => void;
}

export default function MediaUploader({ roomKey, uploadedBy, onUploadComplete, onClose }: MediaUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      uploadFile(files[0]);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
    }
  }, []);

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError("File too large. Maximum size is 50MB.");
      setIsUploading(false);
      return;
    }

    // Validate file type
    const type = getMediaType(file.name);
    if (type === "image") {
      const validImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
      if (!validImageTypes.includes(file.type)) {
        setUploadError("Unsupported image format.");
        setIsUploading(false);
        return;
      }
    }

    try {
      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64String = result.split(",")[1];
          resolve(base64String);
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 50));
          }
        };
        reader.readAsDataURL(file);
      });

      setUploadProgress(50);

      // Upload to server
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileData: base64,
          roomKey,
          mediaType: type,
          uploadedBy,
        }),
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      setUploadProgress(100);

      if (data.success && data.mediaItem) {
        setTimeout(() => {
          onUploadComplete(data.mediaItem);
        }, 500);
      } else {
        throw new Error(data.error || "Upload failed");
      }
    } catch (err: any) {
      setUploadError(err.message || "Upload failed. Please try again.");
      setIsUploading(false);
    }
  };

  const acceptedFormats = ".jpg,.jpeg,.png,.gif,.webp,.svg,.mp4,.webm,.ogg,.mov,.mp3,.wav,.aac,.flac,.m4a";

  return (
    <div className="px-4 py-3 bg-[#1a1a2e] border-b border-[#2d2d4a] animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-white text-sm font-medium">Upload Media</h3>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-[#252542] text-[#8888a0] hover:text-white transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
          isDragging
            ? "border-[#6c5ce7] bg-[#6c5ce7]/5"
            : "border-[#2d2d4a] hover:border-[#6c5ce7]/50 hover:bg-[#6c5ce7]/5"
        } ${isUploading ? "pointer-events-none" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedFormats}
          onChange={handleFileSelect}
          className="hidden"
        />

        {isUploading ? (
          <div className="space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#6c5ce7]/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-[#6c5ce7] animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="text-white text-sm">Uploading...</p>
              <div className="w-full max-w-xs mx-auto h-1.5 bg-[#2d2d4a] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-[#8888a0] text-xs">{uploadProgress}%</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#6c5ce7]/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-[#6c5ce7]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
              </svg>
            </div>
            <div>
              <p className="text-white text-sm font-medium">
                {isDragging ? "Drop file here" : "Drop a file or click to upload"}
              </p>
              <p className="text-[#8888a0] text-xs mt-1">
                Supports: Images, Videos, Audio (max 50MB)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {uploadError && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-red-400 text-xs">{uploadError}</p>
        </div>
      )}
    </div>
  );
}