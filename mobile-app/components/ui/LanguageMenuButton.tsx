// mobile-app/components/ui/LanguageMenuButton.tsx
import React, { useState } from "react";
import { Menu, IconButton } from "react-native-paper";
import i18n from "../../src/lib/i18n";

/**
 * A small language selector menu that can be placed in the header. When
 * tapped it shows all supported languages and changes the app language
 * immediately via i18next.  The button uses the Material "translate"
 * icon to convey that it controls language.  The menu floats on the
 * right side of its parent by default (see styling in HeaderBanner).
 */
export default function LanguageMenuButton() {
  const [visible, setVisible] = useState(false);

  // Filter out special i18next codes like cimode/dev
  const supported = (i18n.options?.supportedLngs as string[] | undefined)?.filter(
    (lng) => lng && lng !== "cimode" && lng !== "dev"
  ) || ["en"];

  /**
   * Return a human friendly label for a language code.  If you add new
   * supported languages be sure to extend this switch.  Unknown codes
   * fall back to their uppercase representation.
   */
  const getLabel = (lng: string) => {
    switch (lng) {
      case "en":
        return "English";
      case "es":
        return "Español";
      case "qps":
        return "Pseudo";
      default:
        return lng.toUpperCase();
    }
  };

  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={<IconButton icon="translate" onPress={() => setVisible(true)} />}
      style={{ position: "absolute", right: 0, top: 0 }}
    >
      {supported.map((lng) => (
        <Menu.Item
          key={lng}
          onPress={() => {
            i18n.changeLanguage(lng);
            setVisible(false);
          }}
          title={getLabel(lng)}
        />
      ))}
    </Menu>
  );
}
