import React from 'react';
import {
  Briefcase,
  TrendingUp,
  Sparkles,
  Home,
  Utensils,
  Car,
  HeartPulse,
  Film,
  GraduationCap,
  CreditCard,
  ShoppingBag,
  MoreHorizontal,
  Building2,
  Wallet,
  LineChart,
  Coins,
  ShieldCheck,
  Plane,
  Laptop,
  Target,
  Tag,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  Landmark,
  Heart,
  PiggyBank,
  Shield,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';

export const ICON_MAP: Record<string, LucideIcon> = {
  Briefcase,
  TrendingUp,
  Sparkles,
  Home,
  Utensils,
  Car,
  HeartPulse,
  Film,
  GraduationCap,
  CreditCard,
  ShoppingBag,
  MoreHorizontal,
  Building2,
  Wallet,
  LineChart,
  Coins,
  ShieldCheck,
  Plane,
  Laptop,
  Target,
  Tag,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  Landmark,
  Heart,
  PiggyBank,
  Shield,
  HelpCircle,
};

interface CategoryIconProps {
  name: string;
  className?: string;
  color?: string;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({ name, className = 'w-4 h-4', color }) => {
  const IconComponent = ICON_MAP[name] || HelpCircle;
  return <IconComponent className={className} style={color ? { color } : undefined} />;
};
