# Formik Patterns & Recipes

## Complete Form Example

```tsx
import { Formik, Form, Field, ErrorMessage, FieldArray } from 'formik';
import * as Yup from 'yup';

const validationSchema = Yup.object({
  personal: Yup.object({
    firstName: Yup.string().required('Required'),
    lastName: Yup.string().required('Required'),
    email: Yup.string().email('Invalid email').required('Required'),
  }),
  address: Yup.object({
    street: Yup.string().required('Required'),
    city: Yup.string().required('Required'),
    zip: Yup.string().matches(/^\d{5}$/, 'Invalid ZIP').required('Required'),
  }),
  skills: Yup.array()
    .of(Yup.string().required('Skill required'))
    .min(1, 'Add at least one skill'),
  agree: Yup.boolean().isTrue('Must accept terms'),
});

function CompleteForm() {
  return (
    <Formik
      initialValues={{
        personal: { firstName: '', lastName: '', email: '' },
        address: { street: '', city: '', zip: '' },
        skills: [''],
        agree: false,
      }}
      validationSchema={validationSchema}
      onSubmit={(values) => console.log(values)}
    >
      {({ values, isSubmitting }) => (
        <Form>
          <h3>Personal Info</h3>
          <Field name="personal.firstName" placeholder="First Name" />
          <ErrorMessage name="personal.firstName" component="div" />

          <Field name="personal.lastName" placeholder="Last Name" />
          <ErrorMessage name="personal.lastName" component="div" />

          <Field name="personal.email" type="email" placeholder="Email" />
          <ErrorMessage name="personal.email" component="div" />

          <h3>Address</h3>
          <Field name="address.street" placeholder="Street" />
          <Field name="address.city" placeholder="City" />
          <Field name="address.zip" placeholder="ZIP" />

          <h3>Skills</h3>
          <FieldArray name="skills">
            {({ push, remove }) => (
              <>
                {values.skills.map((_, index) => (
                  <div key={index}>
                    <Field name={`skills.${index}`} />
                    <button type="button" onClick={() => remove(index)}>
                      Remove
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => push('')}>
                  Add Skill
                </button>
              </>
            )}
          </FieldArray>

          <label>
            <Field type="checkbox" name="agree" />
            I agree to terms
          </label>
          <ErrorMessage name="agree" component="div" />

          <button type="submit" disabled={isSubmitting}>
            Submit
          </button>
        </Form>
      )}
    </Formik>
  );
}
```

## Reusable Form Components

### TextInput

```tsx
import { useField } from 'formik';

interface TextInputProps {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
}

const TextInput: React.FC<TextInputProps> = ({ label, ...props }) => {
  const [field, meta] = useField(props);

  return (
    <div className="form-group">
      <label htmlFor={props.name}>{label}</label>
      <input
        {...field}
        {...props}
        id={props.name}
        className={meta.touched && meta.error ? 'error' : ''}
      />
      {meta.touched && meta.error && (
        <div className="error-message">{meta.error}</div>
      )}
    </div>
  );
};
```

### Select

```tsx
interface SelectProps {
  label: string;
  name: string;
  options: Array<{ value: string; label: string }>;
}

const Select: React.FC<SelectProps> = ({ label, options, ...props }) => {
  const [field, meta] = useField(props);

  return (
    <div className="form-group">
      <label htmlFor={props.name}>{label}</label>
      <select {...field} {...props} id={props.name}>
        <option value="">Select...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {meta.touched && meta.error && (
        <div className="error-message">{meta.error}</div>
      )}
    </div>
  );
};
```

### Checkbox

```tsx
interface CheckboxProps {
  label: string;
  name: string;
}

const Checkbox: React.FC<CheckboxProps> = ({ label, ...props }) => {
  const [field, meta] = useField({ ...props, type: 'checkbox' });

  return (
    <div className="form-group">
      <label>
        <input type="checkbox" {...field} {...props} />
        {label}
      </label>
      {meta.touched && meta.error && (
        <div className="error-message">{meta.error}</div>
      )}
    </div>
  );
};
```

### RadioGroup

```tsx
interface RadioGroupProps {
  label: string;
  name: string;
  options: Array<{ value: string; label: string }>;
}

const RadioGroup: React.FC<RadioGroupProps> = ({ label, options, ...props }) => {
  const [field, meta] = useField(props);

  return (
    <div className="form-group">
      <label>{label}</label>
      {options.map((opt) => (
        <label key={opt.value}>
          <input
            type="radio"
            {...field}
            value={opt.value}
            checked={field.value === opt.value}
          />
          {opt.label}
        </label>
      ))}
      {meta.touched && meta.error && (
        <div className="error-message">{meta.error}</div>
      )}
    </div>
  );
};
```

## Multi-Step Form

```tsx
const steps = [
  { component: PersonalInfo, validationSchema: personalSchema },
  { component: AddressInfo, validationSchema: addressSchema },
  { component: Review, validationSchema: null },
];

function MultiStepForm() {
  const [step, setStep] = useState(0);
  const CurrentStep = steps[step].component;

  const handleSubmit = async (values, { setSubmitting }) => {
    if (step < steps.length - 1) {
      setStep(step + 1);
      setSubmitting(false);
    } else {
      await submitForm(values);
    }
  };

  return (
    <Formik
      initialValues={{
        firstName: '',
        lastName: '',
        email: '',
        street: '',
        city: '',
        zip: '',
      }}
      validationSchema={steps[step].validationSchema}
      onSubmit={handleSubmit}
    >
      {({ isSubmitting }) => (
        <Form>
          <div className="steps">
            {steps.map((_, index) => (
              <span
                key={index}
                className={step === index ? 'active' : ''}
              >
                Step {index + 1}
              </span>
            ))}
          </div>

          <CurrentStep />

          <div className="buttons">
            {step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            <button type="submit" disabled={isSubmitting}>
              {step === steps.length - 1 ? 'Submit' : 'Next'}
            </button>
          </div>
        </Form>
      )}
    </Formik>
  );
}
```

## Dependent Fields

```tsx
function DependentFields() {
  return (
    <Formik
      initialValues={{
        country: '',
        state: '',
        city: '',
      }}
      onSubmit={console.log}
    >
      {({ values, setFieldValue }) => (
        <Form>
          <Field
            as="select"
            name="country"
            onChange={(e) => {
              setFieldValue('country', e.target.value);
              setFieldValue('state', ''); // Reset dependent
              setFieldValue('city', '');
            }}
          >
            <option value="">Select Country</option>
            <option value="US">United States</option>
            <option value="CA">Canada</option>
          </Field>

          <Field as="select" name="state" disabled={!values.country}>
            <option value="">Select State</option>
            {getStates(values.country).map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </Field>

          <Field as="select" name="city" disabled={!values.state}>
            <option value="">Select City</option>
            {getCities(values.state).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Field>
        </Form>
      )}
    </Formik>
  );
}
```

## File Upload

```tsx
function FileUpload() {
  return (
    <Formik
      initialValues={{ file: null }}
      onSubmit={(values) => {
        const formData = new FormData();
        formData.append('file', values.file);
        uploadFile(formData);
      }}
    >
      {({ setFieldValue }) => (
        <Form>
          <input
            type="file"
            onChange={(event) => {
              setFieldValue('file', event.currentTarget.files[0]);
            }}
          />
          <button type="submit">Upload</button>
        </Form>
      )}
    </Formik>
  );
}
```

## Async Validation

```tsx
const validateUsername = async (value: string) => {
  if (!value) return;

  try {
    const response = await fetch(`/api/check-username?q=${value}`);
    const { available } = await response.json();
    if (!available) {
      return 'Username is taken';
    }
  } catch {
    return 'Error checking username';
  }
};

<Field
  name="username"
  validate={validateUsername}
  validateOnChange={false}  // Only on blur
/>
```

## Form with Server Errors

```tsx
function FormWithServerErrors() {
  return (
    <Formik
      initialValues={{ email: '', password: '' }}
      onSubmit={async (values, { setErrors, setStatus }) => {
        try {
          await api.login(values);
        } catch (error) {
          if (error.response?.data?.errors) {
            // Field-level errors from server
            setErrors(error.response.data.errors);
          } else {
            // General error
            setStatus({ error: error.message });
          }
        }
      }}
    >
      {({ status }) => (
        <Form>
          {status?.error && (
            <div className="alert alert-error">{status.error}</div>
          )}

          <Field name="email" type="email" />
          <ErrorMessage name="email" component="div" />

          <Field name="password" type="password" />
          <ErrorMessage name="password" component="div" />

          <button type="submit">Login</button>
        </Form>
      )}
    </Formik>
  );
}
```

## Auto-Save Form

```tsx
import { useEffect, useRef } from 'react';
import { useFormikContext } from 'formik';
import { debounce } from 'lodash';

function AutoSave({ delay = 1000 }) {
  const { values, dirty } = useFormikContext();
  const debouncedSave = useRef(
    debounce((vals) => saveToServer(vals), delay)
  ).current;

  useEffect(() => {
    if (dirty) {
      debouncedSave(values);
    }
  }, [values, dirty, debouncedSave]);

  return null;
}

// Usage
<Formik ...>
  <Form>
    <AutoSave />
    {/* fields */}
  </Form>
</Formik>
```

## Form Reset Confirmation

```tsx
function FormWithResetConfirm() {
  return (
    <Formik
      initialValues={{ name: '' }}
      onSubmit={console.log}
    >
      {({ dirty, resetForm }) => (
        <Form>
          <Field name="name" />

          <button
            type="button"
            onClick={() => {
              if (dirty) {
                if (window.confirm('Discard changes?')) {
                  resetForm();
                }
              } else {
                resetForm();
              }
            }}
          >
            Reset
          </button>
        </Form>
      )}
    </Formik>
  );
}
```

## Persist Form State

```tsx
import { useEffect } from 'react';
import { useFormikContext } from 'formik';

function PersistForm({ storageKey }: { storageKey: string }) {
  const { values, setValues } = useFormikContext();

  // Load on mount
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      setValues(JSON.parse(saved));
    }
  }, []);

  // Save on change
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(values));
  }, [values]);

  return null;
}

// Usage
<Formik ...>
  <Form>
    <PersistForm storageKey="my-form" />
    {/* fields */}
  </Form>
</Formik>
```
