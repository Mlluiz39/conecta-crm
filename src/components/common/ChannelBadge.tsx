import React from 'react';
import { ChannelType } from '../../types/crm';

interface ChannelBadgeProps {
  channel: ChannelType;
  showLabel?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export const ChannelBadge: React.FC<ChannelBadgeProps> = ({
  channel,
  showLabel = true,
  className = '',
  size = 'md',
}) => {
  const configs: Record<ChannelType, { label: string; bg: string; text: string; icon: string }> = {
    whatsapp: {
      label: 'WhatsApp',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60',
      text: 'text-emerald-700 dark:text-emerald-400',
      icon: 'chat',
    },
    instagram: {
      label: 'Instagram',
      bg: 'bg-pink-50 dark:bg-pink-950/40 border border-pink-200 dark:border-pink-800/60',
      text: 'text-pink-700 dark:text-pink-400',
      icon: 'photo_camera',
    },
    messenger: {
      label: 'Messenger',
      bg: 'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60',
      text: 'text-blue-700 dark:text-blue-400',
      icon: 'send',
    },
    web: {
      label: 'Webchat',
      bg: 'bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60',
      text: 'text-indigo-700 dark:text-indigo-400',
      icon: 'language',
    },
    email: {
      label: 'E-mail',
      bg: 'bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800/60',
      text: 'text-violet-700 dark:text-violet-400',
      icon: 'mail',
    },
    telefone: {
      label: 'Telefone',
      bg: 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60',
      text: 'text-amber-700 dark:text-amber-400',
      icon: 'call',
    },
  };

  const config = configs[channel] || configs.whatsapp;
  const padding = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold rounded-full ${config.bg} ${config.text} ${padding} ${className}`}
    >
      <span className="material-symbols-outlined text-[13px] leading-none">{config.icon}</span>
      {showLabel && <span>{config.label}</span>}
    </span>
  );
};
