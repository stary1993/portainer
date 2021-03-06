import angular from 'angular';
import { KubernetesConfigurationFormValues, KubernetesConfigurationFormValuesDataEntry } from 'Kubernetes/models/configuration/formvalues';
import { KubernetesConfigurationTypes } from 'Kubernetes/models/configuration/models';
import KubernetesConfigurationHelper from 'Kubernetes/helpers/configurationHelper';
import KubernetesEventHelper from 'Kubernetes/helpers/eventHelper';
import _ from 'lodash-es';

class KubernetesConfigurationController {
  /* @ngInject */
  constructor(
    $async,
    $state,
    Notifications,
    LocalStorage,
    KubernetesConfigurationService,
    KubernetesResourcePoolService,
    ModalService,
    KubernetesApplicationService,
    KubernetesEventService,
    KubernetesNamespaceHelper
  ) {
    this.$async = $async;
    this.$state = $state;
    this.Notifications = Notifications;
    this.LocalStorage = LocalStorage;
    this.ModalService = ModalService;
    this.KubernetesConfigurationService = KubernetesConfigurationService;
    this.KubernetesResourcePoolService = KubernetesResourcePoolService;
    this.KubernetesApplicationService = KubernetesApplicationService;
    this.KubernetesEventService = KubernetesEventService;
    this.KubernetesConfigurationTypes = KubernetesConfigurationTypes;
    this.KubernetesNamespaceHelper = KubernetesNamespaceHelper;

    this.onInit = this.onInit.bind(this);
    this.getConfigurationAsync = this.getConfigurationAsync.bind(this);
    this.getEvents = this.getEvents.bind(this);
    this.getEventsAsync = this.getEventsAsync.bind(this);
    this.getApplications = this.getApplications.bind(this);
    this.getApplicationsAsync = this.getApplicationsAsync.bind(this);
    this.getConfigurationsAsync = this.getConfigurationsAsync.bind(this);
    this.updateConfiguration = this.updateConfiguration.bind(this);
    this.updateConfigurationAsync = this.updateConfigurationAsync.bind(this);
  }

  isSystemNamespace() {
    return this.KubernetesNamespaceHelper.isSystemNamespace(this.configuration.Namespace);
  }

  selectTab(index) {
    this.LocalStorage.storeActiveTab('configuration', index);
  }

  showEditor() {
    this.state.showEditorTab = true;
    this.selectTab(2);
  }

  isFormValid() {
    if (this.formValues.IsSimple) {
      return this.formValues.Data.length > 0 && this.state.isDataValid;
    }
    return this.state.isDataValid;
  }

  async updateConfigurationAsync() {
    try {
      this.state.actionInProgress = true;
      if (
        this.formValues.Type !== this.configuration.Type ||
        this.formValues.ResourcePool.Namespace.Name !== this.configuration.Namespace ||
        this.formValues.Name !== this.configuration.Name
      ) {
        await this.KubernetesConfigurationService.create(this.formValues);
        await this.KubernetesConfigurationService.delete(this.configuration);
        this.Notifications.success('Configuration succesfully updated');
        this.$state.go(
          'kubernetes.configurations.configuration',
          {
            namespace: this.formValues.ResourcePool.Namespace.Name,
            name: this.formValues.Name,
          },
          { reload: true }
        );
      } else {
        await this.KubernetesConfigurationService.update(this.formValues);
        this.Notifications.success('Configuration succesfully updated');
        this.$state.reload();
      }
    } catch (err) {
      this.Notifications.error('Failure', err, 'Unable to update configuration');
    } finally {
      this.state.actionInProgress = false;
    }
  }

  updateConfiguration() {
    if (this.configuration.Used) {
      const plural = this.configuration.Applications.length > 1 ? 's' : '';
      this.ModalService.confirmUpdate(
        `The changes will be propagated to ${this.configuration.Applications.length} running application${plural}. Are you sure you want to update this configuration?`,
        (confirmed) => {
          if (confirmed) {
            return this.$async(this.updateConfigurationAsync);
          }
        }
      );
    } else {
      return this.$async(this.updateConfigurationAsync);
    }
  }

  async getConfigurationAsync() {
    try {
      this.state.configurationLoading = true;
      const name = this.$transition$.params().name;
      const namespace = this.$transition$.params().namespace;
      this.configuration = await this.KubernetesConfigurationService.get(namespace, name);
    } catch (err) {
      this.Notifications.error('Failure', err, 'Unable to retrieve configuration');
    } finally {
      this.state.configurationLoading = false;
    }
  }

  getConfiguration() {
    return this.$async(this.getConfigurationAsync);
  }

  async getApplicationsAsync(namespace) {
    try {
      this.state.applicationsLoading = true;
      const applications = await this.KubernetesApplicationService.get(namespace);
      this.configuration.Applications = KubernetesConfigurationHelper.getUsingApplications(this.configuration, applications);
      KubernetesConfigurationHelper.setConfigurationUsed(this.configuration);
    } catch (err) {
      this.Notifications.error('Failure', err, 'Unable to retrieve applications');
    } finally {
      this.state.applicationsLoading = false;
    }
  }

  getApplications(namespace) {
    return this.$async(this.getApplicationsAsync, namespace);
  }

  hasEventWarnings() {
    return this.state.eventWarningCount;
  }

  async getEventsAsync(namespace) {
    try {
      this.state.eventsLoading = true;
      this.events = await this.KubernetesEventService.get(namespace);
      this.events = _.filter(this.events, (event) => event.Involved.uid === this.configuration.Id);
      this.state.eventWarningCount = KubernetesEventHelper.warningCount(this.events);
    } catch (err) {
      this.Notifications('Failure', err, 'Unable to retrieve events');
    } finally {
      this.state.eventsLoading = false;
    }
  }

  getEvents(namespace) {
    return this.$async(this.getEventsAsync, namespace);
  }

  async getConfigurationsAsync() {
    try {
      this.configurations = await this.KubernetesConfigurationService.get();
    } catch (err) {
      this.Notifications.error('Failure', err, 'Unable to retrieve configurations');
    }
  }

  getConfigurations() {
    return this.$async(this.getConfigurationsAsync);
  }

  async onInit() {
    try {
      this.state = {
        actionInProgress: false,
        configurationLoading: true,
        applicationsLoading: true,
        eventsLoading: true,
        showEditorTab: false,
        viewReady: false,
        eventWarningCount: 0,
        activeTab: 0,
        currentName: this.$state.$current.name,
        isDataValid: true,
      };

      this.state.activeTab = this.LocalStorage.getActiveTab('configuration');

      this.formValues = new KubernetesConfigurationFormValues();

      this.resourcePools = await this.KubernetesResourcePoolService.get();
      await this.getConfiguration();
      await this.getApplications(this.configuration.Namespace);
      await this.getEvents(this.configuration.Namespace);
      this.formValues.ResourcePool = _.find(this.resourcePools, (resourcePool) => resourcePool.Namespace.Name === this.configuration.Namespace);
      this.formValues.Id = this.configuration.Id;
      this.formValues.Name = this.configuration.Name;
      this.formValues.Type = this.configuration.Type;
      this.formValues.Data = _.map(this.configuration.Data, (value, key) => {
        if (this.configuration.Type === KubernetesConfigurationTypes.SECRET) {
          value = atob(value);
        }
        this.formValues.DataYaml += key + ': ' + value + '\n';
        const entry = new KubernetesConfigurationFormValuesDataEntry();
        entry.Key = key;
        entry.Value = value;
        return entry;
      });
      await this.getConfigurations();
    } catch (err) {
      this.Notifications.error('Failure', err, 'Unable to load view data');
    } finally {
      this.state.viewReady = true;
    }
  }

  $onInit() {
    return this.$async(this.onInit);
  }

  $onDestroy() {
    if (this.state.currentName !== this.$state.$current.name) {
      this.LocalStorage.storeActiveTab('configuration', 0);
    }
  }
}

export default KubernetesConfigurationController;
angular.module('portainer.kubernetes').controller('KubernetesConfigurationController', KubernetesConfigurationController);
