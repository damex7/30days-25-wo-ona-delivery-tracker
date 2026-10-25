// Nigerian phone numbers. People type them many ways (0803..., 803..., +234 803...,
// 234-803-...); we store ONE form, +234XXXXXXXXXX, so comparisons and WhatsApp
// links always work. Mobile numbers start 70, 80, 81, 90 or 91 after +234.

/** Any common way of writing a Nigerian mobile number → "+2348031234567", or null. */
export function normalizeNgPhone(input: string): string | null {
  const digits = input.replace(/[\s().-]/g, "").replace(/^\+/, "");
  let local: string;
  if (/^234\d{10}$/.test(digits)) local = digits.slice(3);
  else if (/^0\d{10}$/.test(digits)) local = digits.slice(1);
  else if (/^\d{10}$/.test(digits)) local = digits;
  else return null;
  return /^[789][01]\d{8}$/.test(local) ? `+234${local}` : null;
}

/** "+2348031234567" → "0803 123 4567", the way Nigerians write it. */
export function formatNgPhone(e164: string): string {
  const local = `0${e164.slice(4)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/** "+2348031234567" → "0803 ••• 4567": enough to recognise, not enough to call. */
export function maskNgPhone(e164: string): string {
  const local = `0${e164.slice(4)}`;
  return `${local.slice(0, 4)} ••• ${local.slice(7)}`;
}

/** A wa.me link that opens WhatsApp with a message already typed. */
export function whatsappLink(e164: string, text: string): string {
  return `https://wa.me/${e164.slice(1)}?text=${encodeURIComponent(text)}`;
}
