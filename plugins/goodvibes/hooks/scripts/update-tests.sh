#!/bin/bash
# Script to update commandExists tests from sync to async

FILE="src/__tests__/file-utils.test.ts"

# Update the Windows test
sed -i 's/mockExecSync\.mockReturnValue(/mockExec.mockResolvedValue({/g; s/Buffer\.from('\''C:\\\\Program Files\\\\Git\\\\cmd\\\\git\.exe'\'')/stdout: '\''C:\\\\Program Files\\\\Git\\\\cmd\\\\git.exe'\'', stderr: '\'''\''/g' "$FILE"
sed -i 's/const result = commandExists('\''git'\'')/const result = await commandExists('\''git'\'')/g' "$FILE"
sed -i 's/expect(mockExecSync)\.toHaveBeenCalledWith('\''where git'\'', {/expect(mockExec).toHaveBeenCalledWith('\''where git'\'', {/g' "$FILE"
sed -i 's/stdio: '\''ignore'\''/timeout: 30000/g; s/timeout: 30000$/timeout: 30000,\n        maxBuffer: 1024 * 1024/g' "$FILE"
