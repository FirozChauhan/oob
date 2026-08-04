"use client";

import type { RoomUser } from "@/lib/types";

interface UserListProps {
  users: RoomUser[];
}

const AVATAR_COLORS = [
  "from-[#ffffff] to-[#c9c9c9]",
  "from-[#e3e3e3] to-[#8f8f8f]",
  "from-[#d4d4d4] to-[#6f6f6f]",
  "from-[#ffffff] to-[#a9a9a9]",
  "from-[#d1d1d1] to-[#7c7c7c]",
  "from-[#f0f0f0] to-[#b5b5b5]",
  "from-[#cdcdcd] to-[#646464]",
  "from-[#e8e8e8] to-[#9a9a9a]",
];

export default function UserList({ users }: UserListProps) {
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-white text-xs font-semibold uppercase tracking-wider">
          Connected
        </h3>
        <span className="text-[#9c9c9c] text-[10px] font-mono bg-[#1d1d1d] px-2 py-0.5 rounded-full">
          {users.length}
        </span>
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {users.map((user, index) => (
          <div
            key={user.id}
            className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-[#1d1d1d] transition-all animate-slide-in"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div
              className={`w-7 h-7 rounded-full ${user.photoURL ? "" : `bg-gradient-to-br ${AVATAR_COLORS[index % AVATAR_COLORS.length]}`} flex items-center justify-center text-[11px] font-bold text-black shrink-0 overflow-hidden`}
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{user.name}</p>
              <p className="text-[#9c9c9c] text-[9px]">
                {user.id === users[0]?.id ? "Host" : "Joined"}
              </p>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}