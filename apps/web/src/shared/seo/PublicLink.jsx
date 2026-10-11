import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { publicPageHref } from './urls';

export default forwardRef(function PublicLink({ to, ...props }, ref) {
  return <Link ref={ref} to={publicPageHref(to)} {...props} />;
});
