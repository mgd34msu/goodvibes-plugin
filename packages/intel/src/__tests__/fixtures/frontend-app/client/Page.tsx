// @ts-nocheck
"use client";
import { useState } from 'react';
import { Widget } from './Widget';

export function Page() {
  const [n] = useState(0);
  return <Widget n={n} />;
}
