import { useTranslation } from 'react-i18next';
import { Field, Label } from '../catalyst/fieldset';
import { Input } from '../catalyst/input';
import { Select } from '../catalyst/select';
import { US_STATES } from '../../constants/states';

export interface AddressData {
  streetAddress: string;
  streetAddressLine2: string;
  city: string;
  state: string;
  zipCode: string;
}

interface AddressFieldsProps {
  address: AddressData;
  onChange: (address: AddressData) => void;
  namePrefix?: string;
  required?: boolean;
}

export default function AddressFields({
  address,
  onChange,
  namePrefix = '',
  required = true
}: AddressFieldsProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* Street + Apt */}
      <div className="grid grid-cols-4 gap-2">
        <Field className="col-span-3">
          <Label className="text-xs">{t('common.form.streetAddress')} {required && '*'}</Label>
          <Input
            name={`${namePrefix}streetAddress`}
            value={address.streetAddress}
            onChange={(e) => onChange({ ...address, streetAddress: e.target.value })}
            required={required}
          />
        </Field>
        <Field className="col-span-1">
          <Label className="text-xs">{t('common.form.addressLine2')}</Label>
          <Input
            name={`${namePrefix}streetAddressLine2`}
            value={address.streetAddressLine2}
            onChange={(e) => onChange({ ...address, streetAddressLine2: e.target.value })}
            placeholder="Apt"
          />
        </Field>
      </div>

      {/* City/State/Zip */}
      <div className="grid grid-cols-12 gap-2">
        <Field className="col-span-6">
          <Label className="text-xs">{t('common.form.city')} {required && '*'}</Label>
          <Input
            name={`${namePrefix}city`}
            value={address.city}
            onChange={(e) => onChange({ ...address, city: e.target.value })}
            required={required}
          />
        </Field>
        <Field className="col-span-2">
          <Label className="text-xs">{t('common.form.state')} {required && '*'}</Label>
          <Select
            name={`${namePrefix}state`}
            value={address.state}
            onChange={(e) => onChange({ ...address, state: e.target.value })}
            required={required}
          >
            <option value="">{t('common.form.select')}</option>
            {US_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </Select>
        </Field>
        <Field className="col-span-4">
          <Label className="text-xs">{t('common.form.zipCode')} {required && '*'}</Label>
          <Input
            name={`${namePrefix}zipCode`}
            value={address.zipCode}
            onChange={(e) => onChange({ ...address, zipCode: e.target.value })}
            required={required}
          />
        </Field>
      </div>
    </>
  );
}
