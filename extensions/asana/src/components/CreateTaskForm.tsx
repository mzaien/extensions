import { Action, ActionPanel, Clipboard, Form, Icon, useNavigation, Toast, getPreferenceValues } from "@raycast/api";
import { format } from "date-fns";
import { FormValidation, getAvatarIcon, useForm } from "@raycast/utils";
import { useMemo } from "react";
import { useWorkspaces } from "../hooks/useWorkspaces";
import { useProjects } from "../hooks/useProjects";
import { useUsers } from "../hooks/useUsers";
import { useMe } from "../hooks/useMe";
import { getErrorMessage } from "../helpers/errors";
import { TaskFormValues } from "../create-task";
import { getProjectIcon } from "../helpers/project";
import TaskDetail from "./TaskDetail";
import { createTask } from "../api/tasks";
import { asanaToRaycastColor } from "../helpers/colors";

export default function CreateTaskForm(props: {
  draftValues?: TaskFormValues;
  assignee?: string;
  workspace?: string;
  fromEmptyView?: boolean;
}) {
  const { push } = useNavigation();

  const { handleSubmit, itemProps, values, focus, reset } = useForm<TaskFormValues>({
    async onSubmit(values) {
      const toast = new Toast({ style: Toast.Style.Animated, title: "Creating task" });
      await toast.show();

      try {
        const { signature } = getPreferenceValues<{ signature: boolean }>();

        let htmlNotes = `<body>${values.description}`;
        if (signature) {
          if (values.description) {
            htmlNotes += "\n--\n";
          }

          htmlNotes += `Created via <a href="https://www.raycast.com/?ref=signatureAsana">Raycast</a>`;
        }
        htmlNotes += "</body>";

        const customFieldsEntries = Object.entries(values).filter(
          ([key, value]) => key.startsWith("field-") && value !== ""
        );
        const customFields = customFieldsEntries.reduce((acc, field) => {
          const fieldId = field[0].split("-")[1];
          return { ...acc, [fieldId]: field[1] };
        }, {});

        const task = await createTask({
          workspace: values.workspace,
          name: values.name,
          custom_fields: customFields,
          ...(values.projects && values.projects.length > 0 ? { projects: values.projects } : {}),
          ...(values.description ? { html_notes: htmlNotes } : {}),
          ...(values.assignee ? { assignee: values.assignee } : {}),
          ...(values.due_date ? { due_on: format(values.due_date, "yyyy-MM-dd") } : {}),
        });

        toast.style = Toast.Style.Success;
        toast.title = "Created task";

        toast.primaryAction = {
          title: "Open Task",
          shortcut: { modifiers: ["cmd", "shift"], key: "o" },
          onAction: () => push(<TaskDetail task={task} />),
        };

        toast.secondaryAction = {
          title: "Copy Task URL",
          shortcut: { modifiers: ["cmd", "shift"], key: "c" },
          onAction: () => {
            Clipboard.copy(task.permalink_url);
            toast.title = "Copied to clipboard";
            toast.message = task.permalink_url;
          },
        };

        reset({ name: "", description: "", due_date: null });

        focus("name");
      } catch (error) {
        toast.style = Toast.Style.Failure;
        toast.title = "Failed to create task";
        toast.message = getErrorMessage(error);
      }
    },
    validation: {
      workspace: FormValidation.Required,
      name: FormValidation.Required,
    },
    initialValues: {
      workspace: props.draftValues?.workspace || props.workspace,
      projects: props.draftValues?.projects,
      name: props.draftValues?.name,
      description: props.draftValues?.description,
      assignee: props.draftValues?.assignee || props.assignee,
      due_date: props.draftValues?.due_date,
    },
  });

  const { data: workspaces } = useWorkspaces();
  const { data: allProjects } = useProjects(values.workspace);
  const { data: users } = useUsers(values.workspace);
  const { data: me } = useMe();

  const customFields = useMemo(() => {
    const selectedProjects = allProjects?.filter((project) => {
      return values.projects?.includes(project.gid);
    });

    return selectedProjects
      ?.filter((project) => project.custom_field_settings && project.custom_field_settings.length > 0)
      ?.map((project) => project.custom_field_settings?.map((setting) => setting.custom_field))
      .flat();
  }, [values.projects]);

  const hasCustomFields = customFields && customFields.length > 0;

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Task" onSubmit={handleSubmit} />
        </ActionPanel>
      }
      enableDrafts={!props.fromEmptyView}
    >
      <Form.Dropdown title="Workspace" storeValue {...itemProps.workspace}>
        {workspaces?.map((workspace) => {
          return <Form.Dropdown.Item key={workspace.gid} value={workspace.gid} title={workspace.name} />;
        })}
      </Form.Dropdown>

      <Form.TagPicker title="Projects" placeholder="Select one or more projects" storeValue {...itemProps.projects}>
        {allProjects?.map((project) => {
          return (
            <Form.TagPicker.Item
              key={project.gid}
              icon={getProjectIcon(project)}
              title={project.name}
              value={project.gid}
            />
          );
        })}
      </Form.TagPicker>

      <Form.Separator />

      <Form.TextField title="Task Name" placeholder="Short title for the task" autoFocus {...itemProps.name} />

      <Form.TextArea title="Description" placeholder="Add more detail to this task" {...itemProps.description} />

      <Form.Dropdown title="Assignee" storeValue {...itemProps.assignee}>
        <Form.Dropdown.Item title="Unassigned" value="" icon={Icon.Person} />

        {users?.map((user) => {
          return (
            <Form.Dropdown.Item
              key={user.gid}
              value={user.gid}
              title={user.gid === me?.gid ? `${user.name} (me)` : user.name}
              icon={getAvatarIcon(user.name)}
            />
          );
        })}
      </Form.Dropdown>

      <Form.DatePicker title="Due Date" type={Form.DatePicker.Type.Date} {...itemProps.due_date} />

      {hasCustomFields
        ? customFields.map((field) => {
            if (field.resource_subtype === "enum") {
              return (
                <Form.Dropdown id={`field-${field.gid}`} key={field.gid} title={field.name}>
                  <Form.Dropdown.Item title="–" value="" />

                  {field.resource_subtype === "enum"
                    ? field.enum_options?.map((option) => {
                        return (
                          <Form.Dropdown.Item
                            key={option.gid}
                            title={option.name}
                            value={option.gid}
                            icon={{ source: Icon.Circle, tintColor: asanaToRaycastColor(option.color) }}
                          />
                        );
                      })
                    : null}
                </Form.Dropdown>
              );
            }

            if (field.resource_subtype === "text" || field.resource_subtype === "number") {
              return (
                <Form.TextField id={`field-${field.gid}`} key={field.gid} title={field.name} placeholder={field.name} />
              );
            }
          })
        : null}
    </Form>
  );
}
