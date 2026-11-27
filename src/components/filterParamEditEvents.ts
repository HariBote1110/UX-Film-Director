type FilterParamEditEventTarget = {
  type?: string;
};

type FilterParamEditKeyEvent = {
  key: string;
  target: unknown;
};

export const createFilterParamEditEventHandlers = ({
  begin,
  commit,
}: {
  begin: () => void;
  commit: () => void;
}) => ({
  onFocusCapture: begin,
  onBlurCapture: commit,
  onInputCapture: begin,
  onChangeCapture: begin,
  onPointerUpCapture: commit,
  onKeyDownCapture: begin,
  onKeyUpCapture: (event: FilterParamEditKeyEvent) => {
    if ((event.target as FilterParamEditEventTarget | null)?.type === 'range'
      || event.key === 'Enter'
      || event.key === 'Escape') commit();
  },
});
