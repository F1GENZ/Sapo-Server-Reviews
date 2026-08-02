import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { useOrgRoute } from "../hooks/useOrgRoute";

const OrgLink = forwardRef(({ to, ...props }, ref) => {
  const route = useOrgRoute();

  return <Link ref={ref} to={route(to)} {...props} />;
});

OrgLink.displayName = "OrgLink";

export default OrgLink;
