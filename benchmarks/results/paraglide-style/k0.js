export function k0(locale, name) {
  const t = locale === "de" ? "Nachricht 0 für {name}" : locale === "fr" ? "Message 0 pour {name}" : "Message 0 for {name}";
  return t.replace("{name}", name);
}
