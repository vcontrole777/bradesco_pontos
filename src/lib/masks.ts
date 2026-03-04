export function maskCPF(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function isValidCPF(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  // Rejeita sequências repetidas (ex: 111.111.111-11)
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(digits[i]) * (len + 1 - i);
    const rem = (sum * 10) % 11;
    return rem === 10 ? 0 : rem;
  };

  return calc(9) === parseInt(digits[9]) && calc(10) === parseInt(digits[10]);
}

export function isValidPhone(value: string): boolean {
  return value.replace(/\D/g, "").length === 11;
}

export function unmask(value: string): string {
  return value.replace(/\D/g, "");
}
