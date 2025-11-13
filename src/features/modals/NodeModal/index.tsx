import React from "react";
import type { ModalProps } from "@mantine/core";
import {
  Modal,
  Stack,
  Text,
  ScrollArea,
  Flex,
  CloseButton,
  Button,
  Group,
  Textarea,
} from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useJson from "../../../store/useJson";
import useFile from "../../../store/useFile";
import { modify, applyEdits, parse } from "jsonc-parser";

// Helper to get value at a JSON path
const getValueAtPath = (json: string, path: (string | number)[]): any => {
  try {
    const parsed = parse(json);
    let current = parsed;
    for (const segment of path) {
      current = current[segment];
    }
    return current;
  } catch {
    return null;
  }
};

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const setSelectedNode = useGraph(state => state.setSelectedNode);
  const setGraph = useGraph(state => state.setGraph);
  const getJson = useJson(state => state.getJson);
  const setJson = useJson(state => state.setJson);

  const [isEditing, setIsEditing] = React.useState(false);
  const [value, setValue] = React.useState<string>(normalizeNodeData(nodeData?.text ?? []));
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setValue(normalizeNodeData(nodeData?.text ?? []));
    setIsEditing(false);
    setError(null);
  }, [nodeData?.id, opened]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setValue(normalizeNodeData(nodeData?.text ?? []));
    setIsEditing(false);
    setError(null);
  };

  const handleSave = async () => {
    if (!nodeData) return;

    try {
      const original = getJson();
      const path = nodeData.path ?? [];
      const nodeIdToUpdate = nodeData.id;

      // Get the original value at this path
      const originalValue = getValueAtPath(original, path);
      
      // Parse the edited value
      let editedValue: any;
      try {
        editedValue = JSON.parse(value);
      } catch (e) {
        // If it fails to parse as JSON, treat as string
        const trimmed = value.trim();
        if (/^[-0-9.]+$/.test(trimmed) || trimmed === "null" || trimmed === "true" || trimmed === "false") {
          editedValue = JSON.parse(trimmed);
        } else {
          editedValue = trimmed.replace(/^"|"$/g, "");
        }
      }

      // If original value is an object and edited value is an object, merge them
      // This preserves fields that weren't shown in the edit modal (like nested objects/arrays)
      let valueToSet = editedValue;
      if (typeof originalValue === "object" && originalValue !== null && !Array.isArray(originalValue) &&
          typeof editedValue === "object" && editedValue !== null && !Array.isArray(editedValue)) {
        valueToSet = {
          ...originalValue,
          ...editedValue,
        };
      }

      // Apply the modification to the JSON
      const edits = modify(original, path, valueToSet, {
        formattingOptions: { insertSpaces: true, tabSize: 2 },
      });

      const newJson = applyEdits(original, edits);

      // Update both stores so editor and graph refresh
      useFile.getState().setContents({ contents: newJson, hasChanges: true });
      setJson(newJson);
      
      // Rebuild graph from updated JSON
      setGraph(newJson);

      // After graph rebuild, find and select the updated node to refresh modal content
      setTimeout(() => {
        const updatedNodes = useGraph.getState().nodes;
        const updatedNode = updatedNodes.find(n => n.id === nodeIdToUpdate);
        if (updatedNode) {
          setSelectedNode(updatedNode);
        }
      }, 50);

      setIsEditing(false);
      setError(null);
      // Keep modal open so updated content displays
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Flex>
              {!isEditing && (
                <Button size="xs" mr="xs" onClick={handleEdit}>
                  Edit
                </Button>
              )}
              <CloseButton onClick={onClose} />
            </Flex>
          </Flex>
          <ScrollArea.Autosize mah={250} maw={600}>
            {!isEditing ? (
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            ) : (
              <div>
                <Textarea
                  minRows={6}
                  styles={{ input: { fontFamily: "monospace" } }}
                  value={value}
                  onChange={e => setValue(e.currentTarget.value)}
                />
                {error && (
                  <Text color="red" size="xs" mt="xs">
                    {error}
                  </Text>
                )}
                <Group justify="flex-end" mt="sm">
                  <Button size="xs" color="green" onClick={handleSave}>
                    Save
                  </Button>
                  <Button size="xs" variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                </Group>
              </div>
            )}
          </ScrollArea.Autosize>
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
