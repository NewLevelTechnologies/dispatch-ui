/**
 * Catalyst Link component integrated with React Router
 */

import * as Headless from '@headlessui/react'
import React, { forwardRef } from 'react'
import { Link as RouterLink } from 'react-router-dom'

export const Link = forwardRef(function Link(
  props: { href: string } & React.ComponentPropsWithoutRef<'a'>,
  ref: React.ForwardedRef<HTMLAnchorElement>
) {
  return (
    <Headless.DataInteractive>
      <RouterLink to={props.href} {...props} ref={ref as React.Ref<HTMLAnchorElement>} />
    </Headless.DataInteractive>
  )
})
