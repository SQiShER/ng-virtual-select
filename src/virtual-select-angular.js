import VirtualSelect from 'SQiShER/virtual-select';

function VirtualSelectDirective() {
  function controllerFn() {
    this.formatSearchInput = (item) => {
      if (!this.optionsProvider) {
        return '';
      }
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
    // Since Angular <= 1.3 doesn't support bindToController, we have to handle the binding manually
    if (angular.version && angular.version.major === 1 && angular.version.minor <= 2) {
      const bindToController = [
        'optionsProvider',
        'onSelectCallback',
        'onCloseCallback',
        'onLoadedCallback',
        'itemHeight',
      ];
      // http://blog.thoughtram.io/angularjs/2015/01/02/exploring-angular-1.3-bindToController.html
      bindToController.forEach(property => {
        uiVirtualSelectController[property] = scope[property];
        scope.$watch(property, newValue => {
          this[property] = newValue;
        }).bind(uiVirtualSelectController);
      });
    }

    const customLoadingIndicator = $transclude().siblings('nvs-loading-indicator').eq(0);
    const options = {
      customLoadingIndicator,
      dataProvider: uiVirtualSelectController.optionsProvider,
      onSelect(item) {
        // we defer this execution in case an item gets selected during a digest cycle
        scope.$evalAsync(() => {
          ngModelController.$setViewValue(item);
          uiVirtualSelectController.onSelectCallback({
            value: item,
          });
        });
      },
      onClose() {
        scope.$evalAsync(() => {
          uiVirtualSelectController.onCloseCallback();
        });
      },
      onLoaded() {
        uiVirtualSelectController.onLoadedCallback();
      },
    };
    if (uiVirtualSelectController.itemHeight > 0) {
      options.itemHeight = parseInt(uiVirtualSelectController.itemHeight, 10);
    }
    const virtualselect = new VirtualSelect(elem, options);

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
      itemHeight: '@uiItemHeight',
      onSelectCallback: '&uiOnSelect',
      onCloseCallback: '&uiOnClose',
      onLoadedCallback: '&uiOnLoaded',
    },
  };
}

angular.module('uiVirtualSelect', []).directive('uiVirtualSelect', VirtualSelectDirective);
