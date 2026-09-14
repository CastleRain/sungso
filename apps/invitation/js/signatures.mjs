import { renderSignatureEnvelope, createEnvelopeSignature } from './signature-envelope.mjs?v=20260914-scroll-editions';
import { renderSignatureConstellation, createConstellationSignature } from './signature-constellation.mjs?v=20260914-scroll-editions';
import { renderSignatureTicket, createTicketSignature } from './signature-ticket.mjs?v=20260914-scroll-editions';

const renderers = { envelope: renderSignatureEnvelope, constellation: renderSignatureConstellation, ticket: renderSignatureTicket };

export function signatureBody(selection, parts) {
  return Object.hasOwn(renderers, selection.templateId)
    ? renderers[selection.templateId](selection, parts)
    : Object.values(parts).join('');
}

export function createSignatures() {
  const controllers = [createEnvelopeSignature(), createConstellationSignature(), createTicketSignature()];
  return {
    mount(root) { controllers.forEach(controller => controller.mount(root)); },
    dispose() { controllers.forEach(controller => controller.dispose()); },
  };
}
