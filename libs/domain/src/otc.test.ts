import { describe, expect, it } from 'vitest';
import { isOtc, otcCheck } from './otc.js';

const ok = (genericName: string, form: string, extra: { herbal?: boolean; device?: boolean; name?: string } = {}) => isOtc({ genericName, form, ...extra });

describe('otcCheck', () => {
  it('keeps everyday over-the-counter medicines', () => {
    expect(ok('Paracetamol', 'Tablet')).toBe(true);
    expect(ok('Paracetamol + Caffeine', 'Tablet')).toBe(true);
    expect(ok('Aluminium Hydroxide + Magnesium Hydroxide', 'Suspension')).toBe(true);
    expect(ok('Oral rehydration salts', 'Sachet')).toBe(true);
    expect(ok('Fexofenadine Hydrochloride', 'Tablet')).toBe(true);
    expect(ok('Calcium Carbonate + Vitamin D3', 'Tablet')).toBe(true);
  });

  it('refuses prescription, controlled and sensitive medicines', () => {
    for (const g of ['Azithromycin', 'Amoxicillin', 'Omeprazole', 'Metformin', 'Losartan', 'Codeine Phosphate', 'Diazepam', 'Sildenafil', 'Prednisolone', 'Tramadol']) {
      expect(ok(g, 'Tablet'), g).toBe(false);
    }
  });

  it('does not let a salt name smuggle a drug through', () => {
    expect(ok('Atorvastatin Calcium', 'Tablet')).toBe(false);
    expect(ok('Nitroglycerin', 'Tablet')).toBe(false);
  });

  it('allows some actives only on the skin', () => {
    expect(ok('Diclofenac Sodium', 'Gel')).toBe(true);
    expect(ok('Diclofenac Sodium', 'Tablet')).toBe(false);
    expect(ok('Clotrimazole', 'Cream')).toBe(true);
    expect(ok('Clotrimazole', 'Vaginal Tablet')).toBe(false);
  });

  it('refuses injectables and inhalers whatever the ingredient', () => {
    expect(ok('Paracetamol', 'IV Infusion')).toBe(false);
    expect(ok('Vitamin B12', 'Injection')).toBe(false);
  });

  it('only lets lubricants through as eye drops', () => {
    expect(ok('Carboxymethylcellulose Sodium', 'Eye Drop')).toBe(true);
    expect(ok('Cetirizine', 'Ophthalmic Solution')).toBe(false);
  });

  it('accepts herbal products and devices but not dangerous herbs', () => {
    expect(ok('Herbal cough syrup', 'Syrup', { herbal: true })).toBe(true);
    expect(ok('Datura', 'Tablet', { herbal: true })).toBe(false);
    expect(ok('Unspecified', 'Thermometer', { device: true })).toBe(true);
  });

  it('says why a product was refused', () => {
    const r = otcCheck({ genericName: 'Azithromycin', form: 'Tablet' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/\w/);
  });
});
