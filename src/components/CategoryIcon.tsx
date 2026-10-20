import React from 'react';
import * as Icons from 'lucide-react';

interface CategoryIconProps {
  name: string;
  className?: string;
  color?: string;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({ name, className = 'w-4 h-4', color }) => {
  const iconMap = Icons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>;
  const IconComponent = iconMap[name] || Icons.HelpCircle;
  return <IconComponent className={className} style={color ? { color } : undefined} />;
};
