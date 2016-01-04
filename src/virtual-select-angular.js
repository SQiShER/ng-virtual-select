import VirtualSelect from 'SQiShER/virtual-select';

function VirtualSelectDirective() {
  function controllerFn() {
    this.formatSearchInput = (item) => {
      if (item) {
        return this.optionsProvider.displayText(item);
      }
      if (this.optionsProvider.noSelectionText) {
        return this.optionsProvider.noSelectionText();
      }
      return '';
    };
  }

  function linkFn(scope, elem, attrs, [uiVirtualSelectController, ngModelController] , $transclude) {
    const customLoadingIndicator = $transclude().siblings('nvs-loading-indicator').eq(0);
    const virtualselect = new VirtualSelect(elem, {
      customLoadingIndicator,
      dataProvider: uiVirtualSelectController.optionsProvider,
      onSelect(item) {
        ngModelController.$setViewValue(item);
        uiVirtualSelectController.onSelectCallback(item);
      },
      onLoaded() {
        uiVirtualSelectController.onLoadedCallback();
      },
    });

    scope.$on('ui-virtual-select:focus', () => {
      virtualselect.focus();
    });

    scope.$on('ui-virtual-select:load', () => {
      virtualselect.load();
    });

    ngModelController.$render = () => {
      virtualselect.select(ngModelController.$viewValue);
    };
  }

  return {
    restrict: 'E',
    require: ['uiVirtualSelect', 'ngModel'],
    controller: controllerFn,
    controllerAs: 'select',
    transclude: true,
    link: linkFn,
    bindToController: true,
    scope: {
      optionsProvider: '=?uiOptionsProvider',
      onSelectCallback: '&uiOnSelect',
      onCloseCallback: '&uiOnClose',
      onLoadedCallback: '&uiOnLoaded',
    },
  };
}

angular.module('uiVirtualSelect', []).directive('uiVirtualSelect', VirtualSelectDirective);
