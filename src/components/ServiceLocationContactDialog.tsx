import type { AdditionalContact } from '../api';
import ContactFormDialog from './ContactFormDialog';

// Thin adapter: service-location contacts use the shared ContactFormDialog. Kept
// as a named entry point so the location call sites read in their own terms
// (locationId) while the form itself is shared with the customer contact card.
interface ServiceLocationContactDialogProps {
  isOpen: boolean;
  onClose: () => void;
  locationId: string;
  // null = add (creates a non-primary contact). Otherwise edit.
  contact: AdditionalContact | null;
  // Cache key for the contacts list to invalidate on success.
  queryKey: string[];
  // Provided only for non-primary edits — renders the destructive Delete.
  onRequestDelete?: () => void;
}

export default function ServiceLocationContactDialog({
  locationId,
  ...rest
}: ServiceLocationContactDialogProps) {
  return <ContactFormDialog parentType="service_location" parentId={locationId} {...rest} />;
}
