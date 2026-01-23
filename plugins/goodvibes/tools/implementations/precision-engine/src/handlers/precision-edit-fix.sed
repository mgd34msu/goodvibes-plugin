# Fix 1: Change interface to make transaction optional
/^  transaction: Transaction;$/c\
  transaction?: Transaction;

# Fix 2: Change interface to make output optional
/^  output: EditOutput;$/c\
  output?: EditOutput;

# Fix 3: Replace transaction validation with defaults
/^    if (!input\.transaction) {$/,/^    }$/ {
  /^    if (!input\.transaction) {$/d
  /return toCallToolResult(errorResult('transaction configuration is required'/d
  /^    }$/d
}

# Fix 4: Replace empty lines and output validation
/^    if (!input\.output) {$/,/^    }$/ {
  /^    if (!input\.output) {$/c\
    // Validate edit specs - ensure each has required fields\
    for (let i = 0; i < input.edits.length; i++) {\
      const edit = input.edits[i];\
      if (!edit.file || typeof edit.file !== 'string') {\
        return toCallToolResult(errorResult(`edits[${i}].file is required and must be a string`, outputMode, getElapsed()));\
      }\
      if (edit.find === undefined || edit.find === null) {\
        return toCallToolResult(errorResult(`edits[${i}].find is required`, outputMode, getElapsed()));\
      }\
      if (edit.replace === undefined || edit.replace === null) {\
        return toCallToolResult(errorResult(`edits[${i}].replace is required`, outputMode, getElapsed()));\
      }\
    }\
\
    // Apply transaction defaults\
    const transaction: Transaction = {\
      mode: input.transaction?.mode ?? 'atomic',\
      rollback_on_fail: input.transaction?.rollback_on_fail ?? true,\
    };\
\
    // Apply output defaults\
    const output: EditOutput = {\
      mode: input.output?.mode ?? 'with_diff',\
      diff_context: input.output?.diff_context ?? 3,\
      max_tokens: input.output?.max_tokens,\
    };
  /return toCallToolResult(errorResult('output configuration is required'/d
  /^    }$/d
}
