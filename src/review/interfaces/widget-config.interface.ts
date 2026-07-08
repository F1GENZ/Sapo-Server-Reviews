export interface WidgetConfig {
  formPhoneMode: 'hidden' | 'optional' | 'required';
  reviewQnaDisplayMode: 'tabs' | 'stacked';
}

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  formPhoneMode: 'optional',
  reviewQnaDisplayMode: 'tabs',
};
