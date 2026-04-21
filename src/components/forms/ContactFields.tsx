import { useTranslation } from 'react-i18next';
import { PatternFormat } from 'react-number-format';
import { Field, Label } from '../catalyst/fieldset';
import { Input } from '../catalyst/input';

export interface ContactData {
  name: string;
  phone: string;
  email: string;
}

interface ContactFieldsProps {
  contact: ContactData;
  onChange: (contact: ContactData) => void;
  namePrefix?: string;
  required?: boolean;
}

export default function ContactFields({
  contact,
  onChange,
  namePrefix = '',
  required = true
}: ContactFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-12 gap-2">
      <Field className="col-span-5">
        <Label className="text-xs">{t('common.form.name')} {required && '*'}</Label>
        <Input
          name={`${namePrefix}name`}
          value={contact.name}
          onChange={(e) => onChange({ ...contact, name: e.target.value })}
          required={required}
        />
      </Field>
      <Field className="col-span-4">
        <Label className="text-xs">{t('common.form.phone')}</Label>
        <PatternFormat
          format="(###) ###-####"
          mask="_"
          customInput={Input}
          name={`${namePrefix}phone`}
          value={contact.phone}
          onValueChange={(values) => onChange({ ...contact, phone: values.value })}
        />
      </Field>
      <Field className="col-span-3">
        <Label className="text-xs">{t('common.form.email')} {required && '*'}</Label>
        <Input
          type="email"
          name={`${namePrefix}email`}
          value={contact.email}
          onChange={(e) => onChange({ ...contact, email: e.target.value })}
          required={required}
        />
      </Field>
    </div>
  );
}
