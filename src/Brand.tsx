import React from "react";
import avatar from "../assets/branding/kai-avatar.png";

export function BrandAvatar({ className = "" }: { className?: string }) {
  return (
    <img
      className={`kai-avatar ${className}`}
      src={avatar}
      alt="KAI 男孩头像"
    />
  );
}
