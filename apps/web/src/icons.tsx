import type { LucideIcon } from "lucide-react";
import { FileText, Flag, Home, IdCard, ScanLine, Wallet } from "lucide-react";

type IconProps = { color: string };

function FeatureGlyph({ Icon, color }: { Icon: LucideIcon; color: string }) {
  return (
    <Icon
      size={24}
      color={color}
      strokeWidth={2.25}
      absoluteStrokeWidth
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      }}
    />
  );
}

function TabGlyph({ Icon, color }: { Icon: LucideIcon; color: string }) {
  return (
    <Icon
      size={22}
      color={color}
      strokeWidth={2.1}
      absoluteStrokeWidth
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      }}
    />
  );
}

export function ScanIcon({ color }: IconProps) {
  return <FeatureGlyph Icon={ScanLine} color={color} />;
}

export function IdIcon({ color }: IconProps) {
  return <FeatureGlyph Icon={IdCard} color={color} />;
}

export function ListIcon({ color }: IconProps) {
  return <FeatureGlyph Icon={FileText} color={color} />;
}

export function WalletIcon({ color }: IconProps) {
  return <FeatureGlyph Icon={Wallet} color={color} />;
}

export function FlagIcon({ color }: IconProps) {
  return <FeatureGlyph Icon={Flag} color={color} />;
}

export function TabHomeIcon({ color }: IconProps) {
  return <TabGlyph Icon={Home} color={color} />;
}

export function TabScanIcon({ color }: IconProps) {
  return <TabGlyph Icon={ScanLine} color={color} />;
}

export function TabIdIcon({ color }: IconProps) {
  return <TabGlyph Icon={IdCard} color={color} />;
}

export function TabListIcon({ color }: IconProps) {
  return <TabGlyph Icon={FileText} color={color} />;
}

export function TabFlagIcon({ color }: IconProps) {
  return <TabGlyph Icon={Flag} color={color} />;
}
