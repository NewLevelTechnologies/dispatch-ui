import { describe, it, expect } from 'vitest';
import { documentBack, withDocumentBack, withWorkOrderBack } from './backContext';

describe('work order back-context', () => {
  it('adds the work order id and number to a link', () => {
    expect(withWorkOrderBack('/service-locations/l1', 'wo-1', 'WO-00208')).toBe(
      '/service-locations/l1?from=work-order&woId=wo-1&woNo=WO-00208',
    );
    expect(withWorkOrderBack('/service-locations/l1', 'wo-1', null)).toBe('/service-locations/l1?from=work-order&woId=wo-1');
  });
});

describe('document back-context', () => {
  it('adds the document to a link, keeping a query the path already has', () => {
    expect(withDocumentBack('/customers/c1', 'quote', 'q-1', 'QTE-00025')).toBe('/customers/c1?from=quote&docId=q-1&docNo=QTE-00025');
    expect(withDocumentBack('/work-orders/wo-1?tab=estimate', 'invoice', 'inv-1', null)).toBe(
      '/work-orders/wo-1?tab=estimate&from=invoice&docId=inv-1',
    );
  });

  it('reads it back as the document’s page', () => {
    expect(documentBack(new URLSearchParams('from=invoice&docId=inv-1&docNo=INV-3307'))).toEqual({
      kind: 'invoice',
      href: '/invoices/inv-1',
      number: 'INV-3307',
    });
    expect(documentBack(new URLSearchParams('from=quote&docId=q-1'))).toEqual({ kind: 'quote', href: '/quotes/q-1', number: null });
  });

  it('ignores other surfaces and a missing id, and never leaves the app', () => {
    expect(documentBack(new URLSearchParams('from=dispatch&docId=x'))).toBeNull();
    expect(documentBack(new URLSearchParams('from=quote'))).toBeNull();
    expect(documentBack(new URLSearchParams('from=quote&docId=..%2F..%2Fevil'))?.href).toBe('/quotes/..%2F..%2Fevil');
  });
});
