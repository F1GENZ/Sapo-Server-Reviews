import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getOrgid } from "../common/AuthStorage";
import { withOrgid } from "../common/routes";

export function useOrgRoute() {
  const location = useLocation();
  const orgid = getOrgid();

  return useCallback(
    (to) => withOrgid(to, orgid, location.search),
    [location.search, orgid],
  );
}

export function useOrgNavigate() {
  const navigate = useNavigate();
  const route = useOrgRoute();

  return useCallback(
    (to, options) => navigate(route(to), options),
    [navigate, route],
  );
}
