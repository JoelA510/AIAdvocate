// Fallback for using MaterialIcons on Android and web.
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";
const MAPPING = {
  "house.fill": "home",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  "bookmark.fill": "bookmark",
  "paperplane.fill": "send", // Re-adding in case it's used in EmptyState
  "file-search-outline": "find-in-page", // NEW: Mapping for the search empty state
  "doc.text": "description",
  sparkles: "auto-awesome",
  "person.2.fill": "group",
  "x.circle": "cancel",
  "person.crop.circle.badge.exclamationmark": "error-outline",
  "person.crop.circle.badge.questionmark": "help-outline",
} as const satisfies Record<string, ComponentProps<typeof MaterialIcons>["name"]>;

export type IconSymbolName = keyof typeof MAPPING;

type IconSymbolProps = {
  name: IconSymbolName;
  size?: number;
  color?: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
};

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: IconSymbolProps) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
