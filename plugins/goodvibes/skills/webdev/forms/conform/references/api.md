# Conform API Reference

## useForm

```tsx
const [form, fields] = useForm<Schema>({
  // Unique form id
  id?: string;

  // Last submission result from server
  lastResult?: SubmissionResult;

  // Client-side validation
  onValidate?(context: {
    formData: FormData;
  }): Submission<Schema>;

  // When to start validating
  shouldValidate?: 'onSubmit' | 'onBlur' | 'onInput';

  // When to re-validate after first error
  shouldRevalidate?: 'onSubmit' | 'onBlur' | 'onInput';

  // Initial values
  defaultValue?: DefaultValue<Schema>;

  // HTML5 constraint validation
  constraint?: Record<string, Constraint>;

  // Called on successful validation
  onSubmit?(
    event: FormEvent<HTMLFormElement>,
    context: {
      formData: FormData;
      submission: Submission<Schema>;
    }
  ): void;
});
```

## Form Object

```tsx
const [form, fields] = useForm();

// Form props
form.id          // Form ID
form.errorId     // Error element ID
form.errors      // Form-level errors

// Submission handlers
form.onSubmit    // Form submit handler
form.onReset     // Form reset handler

// Intent actions
form.insert      // Insert into field array
form.remove      // Remove from field array
form.reorder     // Reorder field array
form.update      // Update field value
form.reset       // Reset field
form.validate    // Trigger validation

// Status
form.status      // 'idle' | 'submitting' | 'success' | 'error'
form.dirty       // Has been modified
form.valid       // Is valid
```

## Field Object

```tsx
const [form, fields] = useForm();

// Field metadata
fields.email.id            // Field ID
fields.email.name          // Field name
fields.email.formId        // Parent form ID
fields.email.errorId       // Error element ID
fields.email.descriptionId // Description element ID
fields.email.initialValue  // Initial value
fields.email.value         // Current value
fields.email.errors        // Array of error messages
fields.email.allErrors     // All errors including nested

// Status
fields.email.dirty         // Has been modified
fields.email.valid         // Is valid

// Methods
fields.email.getFieldset() // Get nested fields (objects)
fields.email.getFieldList() // Get array items

// Constraints
fields.email.required      // Is required
fields.email.minLength     // Min length
fields.email.maxLength     // Max length
fields.email.min           // Min value
fields.email.max           // Max value
fields.email.step          // Step value
fields.email.multiple      // Allows multiple
fields.email.pattern       // Regex pattern
```

## Field Helpers

### getInputProps

```tsx
import { getInputProps } from '@conform-to/react';

getInputProps(field, {
  type?: string;           // Input type
  value?: string | boolean; // For radio/checkbox
  ariaAttributes?: boolean; // Include aria-*
  ariaDescribedBy?: string; // Additional aria-describedby
});

// Returns
{
  id: string;
  name: string;
  form: string;
  defaultValue?: string;
  defaultChecked?: boolean;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  multiple?: boolean;
  pattern?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}
```

### getTextareaProps

```tsx
import { getTextareaProps } from '@conform-to/react';

getTextareaProps(field, {
  ariaAttributes?: boolean;
  ariaDescribedBy?: string;
});
```

### getSelectProps

```tsx
import { getSelectProps } from '@conform-to/react';

getSelectProps(field, {
  ariaAttributes?: boolean;
  ariaDescribedBy?: string;
});
```

### getFieldsetProps

```tsx
import { getFieldsetProps } from '@conform-to/react';

getFieldsetProps(field, {
  ariaAttributes?: boolean;
  ariaDescribedBy?: string;
});
```

### getFormProps

```tsx
import { getFormProps } from '@conform-to/react';

getFormProps(form, {
  ariaAttributes?: boolean;
  ariaDescribedBy?: string;
});

// Returns
{
  id: string;
  onSubmit: FormEventHandler;
  onReset: FormEventHandler;
  noValidate: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}
```

## Intent Helpers

### Insert Button

```tsx
<button
  {...form.insert.getButtonProps({
    name: fields.items.name,
    defaultValue: { title: '' },
    index?: number; // Insert at specific index
  })}
>
  Add Item
</button>
```

### Remove Button

```tsx
<button
  {...form.remove.getButtonProps({
    name: fields.items.name,
    index: 0,
  })}
>
  Remove
</button>
```

### Reorder Button

```tsx
<button
  {...form.reorder.getButtonProps({
    name: fields.items.name,
    from: 0,
    to: 1,
  })}
>
  Move Down
</button>
```

### Update Button

```tsx
<button
  {...form.update.getButtonProps({
    name: fields.quantity.name,
    value: fields.quantity.value + 1,
  })}
>
  Increment
</button>
```

### Reset Button

```tsx
<button
  {...form.reset.getButtonProps({
    name: fields.email.name,
  })}
>
  Reset Email
</button>
```

### Validate Button

```tsx
<button
  {...form.validate.getButtonProps({
    name: fields.email.name,
  })}
>
  Check Email
</button>
```

## Parsing Functions

### parseWithZod

```tsx
import { parseWithZod } from '@conform-to/zod';

const submission = parseWithZod(formData, {
  schema: zodSchema,
  async?: boolean;
});

// Returns
{
  status: 'success' | 'error';
  payload: Record<string, unknown>;
  value?: Schema;
  error?: Record<string, string[]>;
  reply(options?: {
    formErrors?: string[];
    fieldErrors?: Record<string, string[]>;
    resetForm?: boolean;
    hideFields?: string[];
  }): SubmissionResult;
}
```

### parseWithYup

```tsx
import { parseWithYup } from '@conform-to/yup';

const submission = parseWithYup(formData, {
  schema: yupSchema,
  async?: boolean;
});
```

### parseWithValibot

```tsx
import { parseWithValibot } from '@conform-to/valibot';

const submission = parseWithValibot(formData, {
  schema: valibotSchema,
});
```

## Constraint Functions

### getZodConstraint

```tsx
import { getZodConstraint } from '@conform-to/zod';

const constraint = getZodConstraint(zodSchema);
```

### getYupConstraint

```tsx
import { getYupConstraint } from '@conform-to/yup';

const constraint = getYupConstraint(yupSchema);
```

### getValibotConstraint

```tsx
import { getValibotConstraint } from '@conform-to/valibot';

const constraint = getValibotConstraint(valibotSchema);
```

## Submission Reply

```tsx
// In server action
const submission = parseWithZod(formData, { schema });

if (submission.status !== 'success') {
  return submission.reply();
}

// With additional errors
return submission.reply({
  formErrors: ['Server error occurred'],
  fieldErrors: {
    email: ['Email already exists'],
  },
});

// Reset form on success
return submission.reply({ resetForm: true });

// Hide fields in response
return submission.reply({ hideFields: ['password'] });
```

## Type Inference

```tsx
import type { SubmissionResult } from '@conform-to/react';

// In Remix
export async function action({ request }: ActionFunctionArgs) {
  // Return type
  return json<SubmissionResult>(submission.reply());
}

// In Next.js
export async function action(
  prevState: SubmissionResult | undefined,
  formData: FormData
): Promise<SubmissionResult> {
  return submission.reply();
}
```

## Utilities

### unstable_useControl

Control field value programmatically:

```tsx
import { unstable_useControl as useControl } from '@conform-to/react';

function DatePicker({ field }) {
  const control = useControl(field);

  return (
    <ReactDatePicker
      selected={control.value ? new Date(control.value) : undefined}
      onChange={(date) => control.change(date?.toISOString() ?? '')}
      onBlur={control.blur}
    />
  );
}
```

### useInputControl

Simplified control for inputs:

```tsx
import { useInputControl } from '@conform-to/react';

function CustomInput({ field }) {
  const input = useInputControl({
    key: field.key,
    name: field.name,
    formId: field.formId,
    initialValue: field.initialValue,
  });

  return (
    <input
      value={input.value ?? ''}
      onChange={(e) => input.change(e.target.value)}
      onBlur={input.blur}
      onFocus={input.focus}
    />
  );
}
```
