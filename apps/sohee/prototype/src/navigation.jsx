import React from 'react';
export const BASE = '/sungso/sohee/';
export function Link({ to = '', children, ...props }) { return <a href={BASE + to} {...props}>{children}</a>; }
