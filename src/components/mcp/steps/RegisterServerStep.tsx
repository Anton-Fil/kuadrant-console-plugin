import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, Tab, TabTitleText } from '@patternfly/react-core';
import { ResourceYAMLEditor } from '@openshift-console/dynamic-plugin-sdk';
import * as yaml from 'js-yaml';
import { MCPServerFormState } from '../types';
import MCPServerRegistrationFormFields from '../MCPServerRegistrationFormFields';
import { buildMCPServerRegistration } from '../mcpResourceUtils';

interface RegisterServerStepProps {
  formState: MCPServerFormState;
  onChange: (state: MCPServerFormState) => void;
  routeName?: string;
  routeNamespace?: string;
  credentialNamespace?: string;
  credentialName?: string;
  onValidationChange?: (isValid: boolean) => void;
}

const RegisterServerStep: React.FC<RegisterServerStepProps> = ({
  formState,
  onChange,
  routeName,
  routeNamespace,
  credentialNamespace,
  credentialName,
  onValidationChange,
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [activeTab, setActiveTab] = React.useState<'form' | 'yaml'>('form');
  const [yamlKey, setYamlKey] = React.useState(0);

  // Sync wizard-owned references (the route chosen in an earlier step, the namespace
  // from the credential step) into the form. `formState` stays in the dependency array
  // so the merge always builds on the LATEST state: an earlier version closed over a
  // stale `formState`, so when `routeName` settled a tick after the user had already
  // typed a name/prefix (it derives from httpRouteResource, which updates async), the
  // effect re-fired and clobbered those fields back to empty — leaving "Save and
  // continue" disabled (the flaky failure). The equality guard makes the effect a
  // no-op once the references are in sync, so keeping `formState` in deps can't loop.
  // Validity is owned solely by MCPServerRegistrationFormFields' onValidationChange;
  // a single source removes the effect-ordering race between two callers of it.
  React.useEffect(() => {
    const needsRoute = !!routeName && formState.targetHTTPRouteName !== routeName;
    const needsNamespace = !!credentialNamespace && formState.namespace !== credentialNamespace;
    if (needsRoute || needsNamespace) {
      onChange({
        ...formState,
        ...(routeName ? { targetHTTPRouteName: routeName } : {}),
        ...(credentialNamespace ? { namespace: credentialNamespace } : {}),
      });
    }
  }, [routeName, credentialNamespace, formState, onChange]);

  // Rebuilt from form state on every change so the YAML view is always current.
  const serverResource = React.useMemo(
    () =>
      buildMCPServerRegistration(
        { ...formState, namespace: credentialNamespace || formState.namespace },
        credentialNamespace || formState.namespace,
        null,
        routeName,
        routeNamespace,
        credentialName,
      ),
    [formState, routeName, routeNamespace, credentialName],
  );

  const handleChange = (field: keyof MCPServerFormState, value: string) => {
    onChange({ ...formState, [field]: value });
  };

  // Parse YAML edits back into form state live. Invalid intermediate YAML is
  // ignored so typing in the editor doesn't clobber the form.
  const handleYamlChange = (yamlInput: string) => {
    try {
      const parsed = yaml.load(yamlInput) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') return;

      const metadata = parsed.metadata as Record<string, string> | undefined;
      const spec = parsed.spec as Record<string, unknown> | undefined;
      const targetRef = spec?.targetRef as Record<string, string> | undefined;

      onChange({
        registrationName: metadata?.name || '',
        namespace: credentialNamespace || metadata?.namespace || '',
        // When the wizard configured a route, keep it aligned — a YAML edit must not
        // retarget the registration at a route the wizard did not set up.
        targetHTTPRouteName: routeName || targetRef?.name || '',
        toolPrefix: typeof spec?.prefix === 'string' ? spec.prefix : '',
      });
    } catch {
      // Invalid YAML — don't update form state
    }
  };

  return (
    <>
      <Tabs
        activeKey={activeTab}
        onSelect={(_e, key) => {
          const view = key as 'form' | 'yaml';
          if (view === 'yaml') setYamlKey((k) => k + 1);
          setActiveTab(view);
        }}
        style={{ marginBottom: '16px' }}
      >
        <Tab eventKey="form" title={<TabTitleText>{t('Form')}</TabTitleText>} />
        <Tab eventKey="yaml" title={<TabTitleText>{t('YAML')}</TabTitleText>} />
      </Tabs>

      {activeTab === 'form' ? (
        <MCPServerRegistrationFormFields
          formState={formState}
          onChange={handleChange}
          httpRouteNames={routeName ? [routeName] : []}
          showNamespaceField={!credentialNamespace}
          onValidationChange={onValidationChange}
        />
      ) : (
        <div
          className="kuadrant-mcp-wizard__yaml-editor"
          style={{ minHeight: '400px' }}
          key={yamlKey}
        >
          <React.Suspense fallback={<div>{t('Loading YAML editor...')}</div>}>
            <ResourceYAMLEditor
              initialResource={serverResource}
              onChange={handleYamlChange}
              create={true}
            />
          </React.Suspense>
        </div>
      )}
    </>
  );
};

export default RegisterServerStep;
