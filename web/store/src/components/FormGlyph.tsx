const FORMS: Record<string, string> = {
  Tablet: 'T',
  Capsule: 'C',
  Syrup: 'S',
  Injection: 'I',
  Cream: 'Cr',
  Drop: 'D',
  Suspension: 'Su',
  Powder: 'P',
};

export function FormGlyph({ form }: { form: string }) {
  const letter = FORMS[form] ?? (form?.trim()?.[0]?.toUpperCase() || 'M');
  return (
    <span className="form-glyph" aria-hidden="true">
      {letter}
    </span>
  );
}
