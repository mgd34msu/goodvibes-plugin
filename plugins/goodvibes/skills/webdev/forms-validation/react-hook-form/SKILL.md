---
name: react-hook-form
description: Builds performant forms with React Hook Form including validation, error handling, and schema integration. Use when creating forms, validating inputs, integrating with Zod, or handling complex form state.
---

# React Hook Form

Performant, flexible forms with easy validation and minimal re-renders.

## Quick Start

**Install:**
```bash
npm install react-hook-form
```

**Basic form:**
```tsx
import { useForm } from 'react-hook-form';

interface FormData {
  email: string;
  password: string;
}

function LoginForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>();

  const onSubmit = (data: FormData) => {
    console.log(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email', { required: 'Email is required' })} />
      {errors.email && <span>{errors.email.message}</span>}

      <input
        type="password"
        {...register('password', { required: 'Password is required' })}
      />
      {errors.password && <span>{errors.password.message}</span>}

      <button type="submit">Submit</button>
    </form>
  );
}
```

## useForm Hook

### Options

```tsx
const {
  register,
  handleSubmit,
  watch,
  formState,
  reset,
  setValue,
  getValues,
  trigger,
  control,
} = useForm<FormData>({
  defaultValues: {
    email: '',
    password: '',
  },
  mode: 'onBlur', // 'onSubmit' | 'onBlur' | 'onChange' | 'onTouched' | 'all'
  reValidateMode: 'onChange',
  criteriaMode: 'firstError', // 'all' for all errors
  shouldFocusError: true,
});
```

### Form State

```tsx
const {
  errors,           // Validation errors
  isDirty,          // Form has been modified
  isValid,          // All validations pass
  isSubmitting,     // Form is submitting
  isSubmitted,      // Form has been submitted
  isSubmitSuccessful,
  submitCount,      // Number of submissions
  dirtyFields,      // Modified fields
  touchedFields,    // Touched fields
} = formState;
```

## Register

### Basic Registration

```tsx
<input {...register('firstName')} />
<input {...register('lastName')} />
<input type="email" {...register('email')} />
```

### With Validation

```tsx
<input
  {...register('email', {
    required: 'Email is required',
    pattern: {
      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
      message: 'Invalid email address',
    },
  })}
/>

<input
  {...register('age', {
    required: 'Age is required',
    min: { value: 18, message: 'Must be at least 18' },
    max: { value: 100, message: 'Must be under 100' },
  })}
/>

<input
  {...register('username', {
    required: 'Username is required',
    minLength: { value: 3, message: 'At least 3 characters' },
    maxLength: { value: 20, message: 'At most 20 characters' },
  })}
/>

<input
  {...register('password', {
    required: 'Password is required',
    validate: {
      hasUppercase: (value) =>
        /[A-Z]/.test(value) || 'Must contain uppercase',
      hasNumber: (value) =>
        /[0-9]/.test(value) || 'Must contain number',
    },
  })}
/>
```

### Async Validation

```tsx
<input
  {...register('username', {
    validate: async (value) => {
      const response = await fetch(`/api/check-username?name=${value}`);
      const { available } = await response.json();
      return available || 'Username is taken';
    },
  })}
/>
```

## Error Handling

### Display Errors

```tsx
function Form() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>();

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <label>Email</label>
        <input
          {...register('email', { required: 'Email is required' })}
          className={errors.email ? 'error' : ''}
        />
        {errors.email && (
          <span className="error-message">{errors.email.message}</span>
        )}
      </div>
    </form>
  );
}
```

### ErrorMessage Component

```bash
npm install @hookform/error-message
```

```tsx
import { ErrorMessage } from '@hookform/error-message';

<ErrorMessage
  errors={errors}
  name="email"
  render={({ message }) => <p className="error">{message}</p>}
/>
```

## Zod Integration

**Install:**
```bash
npm install @hookform/resolvers zod
```

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[0-9]/, 'Must contain number'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords must match',
  path: ['confirmPassword'],
});

type FormData = z.infer<typeof schema>;

function SignUpForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = (data: FormData) => {
    console.log(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}

      <input type="password" {...register('password')} />
      {errors.password && <span>{errors.password.message}</span>}

      <input type="password" {...register('confirmPassword')} />
      {errors.confirmPassword && <span>{errors.confirmPassword.message}</span>}

      <button type="submit">Sign Up</button>
    </form>
  );
}
```

## Controller

For controlled components (MUI, Radix, custom inputs):

```tsx
import { useForm, Controller } from 'react-hook-form';
import { TextField, Select, MenuItem } from '@mui/material';

function ControlledForm() {
  const { control, handleSubmit } = useForm<FormData>();

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        name="email"
        control={control}
        rules={{ required: 'Email is required' }}
        render={({ field, fieldState: { error } }) => (
          <TextField
            {...field}
            label="Email"
            error={!!error}
            helperText={error?.message}
          />
        )}
      />

      <Controller
        name="role"
        control={control}
        defaultValue=""
        render={({ field }) => (
          <Select {...field} label="Role">
            <MenuItem value="admin">Admin</MenuItem>
            <MenuItem value="user">User</MenuItem>
          </Select>
        )}
      />

      <button type="submit">Submit</button>
    </form>
  );
}
```

## Watch

```tsx
function WatchExample() {
  const { register, watch } = useForm<FormData>();

  // Watch single field
  const email = watch('email');

  // Watch multiple fields
  const [firstName, lastName] = watch(['firstName', 'lastName']);

  // Watch all fields
  const allFields = watch();

  // Watch with callback
  useEffect(() => {
    const subscription = watch((value, { name, type }) => {
      console.log(value, name, type);
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  return (
    <form>
      <input {...register('email')} />
      <p>Current email: {email}</p>
    </form>
  );
}
```

## Form Actions

### Set Values

```tsx
const { setValue, reset, getValues } = useForm<FormData>();

// Set single value
setValue('email', 'test@example.com');

// Set with options
setValue('email', 'test@example.com', {
  shouldValidate: true,
  shouldDirty: true,
  shouldTouch: true,
});

// Get values
const email = getValues('email');
const allValues = getValues();

// Reset form
reset(); // Reset to defaultValues
reset({ email: 'new@example.com' }); // Reset with new values
```

### Trigger Validation

```tsx
const { trigger } = useForm<FormData>();

// Validate single field
await trigger('email');

// Validate multiple fields
await trigger(['email', 'password']);

// Validate all fields
await trigger();
```

## Field Arrays

```bash
npm install react-hook-form
```

```tsx
import { useForm, useFieldArray } from 'react-hook-form';

interface FormData {
  users: { name: string; email: string }[];
}

function DynamicForm() {
  const { register, control, handleSubmit } = useForm<FormData>({
    defaultValues: {
      users: [{ name: '', email: '' }],
    },
  });

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: 'users',
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {fields.map((field, index) => (
        <div key={field.id}>
          <input {...register(`users.${index}.name`)} placeholder="Name" />
          <input {...register(`users.${index}.email`)} placeholder="Email" />
          <button type="button" onClick={() => remove(index)}>
            Remove
          </button>
        </div>
      ))}

      <button type="button" onClick={() => append({ name: '', email: '' })}>
        Add User
      </button>

      <button type="submit">Submit</button>
    </form>
  );
}
```

## Form with Server Action

```tsx
// Next.js App Router
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTransition } from 'react';
import { submitForm } from './actions';

function ContactForm() {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      const result = await submitForm(data);
      if (result.success) {
        reset();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name')} disabled={isPending} />
      <input {...register('email')} disabled={isPending} />
      <textarea {...register('message')} disabled={isPending} />

      <button type="submit" disabled={isPending}>
        {isPending ? 'Sending...' : 'Send'}
      </button>
    </form>
  );
}
```

## With shadcn/ui Form

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function ProfileForm() {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: '',
      email: '',
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="johndoe" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}
```

## Best Practices

1. **Use Zod for validation** - Type-safe, reusable schemas
2. **Set defaultValues** - Prevents undefined values
3. **Use Controller for UI libs** - Proper integration
4. **Watch sparingly** - Only when needed to avoid re-renders
5. **Show loading state** - Disable form during submission

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Missing name prop | Always provide unique name |
| Not using key in arrays | Use field.id for key |
| Direct mutation | Use setValue/reset |
| Validation on every keystroke | Use mode: 'onBlur' |
| Missing error display | Always show error messages |

## Reference Files

- [references/patterns.md](references/patterns.md) - Form patterns
- [references/validation.md](references/validation.md) - Validation rules
- [references/integrations.md](references/integrations.md) - UI library integration
