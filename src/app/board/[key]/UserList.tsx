"use client";

import type { RoomUser } from "@/lib/types";

interface UserListProps {
  users: RoomUser[];
}

const AVATAR_COLORS = [
  "from-[#6c5ce7] to-[#a29bfe]",
  "from-[#fd79a8] to-[#e84393]",
  "from-[#00cec9] to-[#55efc4]",
  "from-[#fdcb6e] to-[#e17055]",
  "from-[#74b9ff] to-[#0984e3]",
  "from-[#a29bfe] to-[#6c5ce7]",
  "from-[#55efc4] to-[#00b894]",
  "from-[#fd79a8] to-[#d63031]",
];

export default function UserList({ users }: UserListProps) {
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-white text-xs font-semibold uppercase tracking-wider">
          Connected
        </h3>
        <span className="text-[#8888a0] text-[10px] font-mono bg-[#252542] px-2 py-0.5 rounded-full">
          {users.length}
        </span>
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {users.map((user, index) => (
          <div
            key={user.id}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[#252542] transition-all animate-slide-in"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div
              className={`w-7 h-7 rounded-full ${user.photoURL ? "" : `bg-gradient-to-br ${AVATAR_COLORS[index % AVATAR_COLORS.length]}`} flex items-center justify-center text-[11px] font-bold text-white shrink-0 overflow-hidden`}
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{user.name}</p>
              <p className="text-[#8888a0] text-[9px]">
                {user.id === users[0]?.id ? "Host" : "Joined"}
              </p>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}