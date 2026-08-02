import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createReview } from "../common/ApiService";
import { getOrgid } from "../common/AuthStorage";
import { shopQueryKeys } from "../common/queryKeys";

export const useCreateReview = () => {
  const queryClient = useQueryClient();
  const orgid = getOrgid();

  return useMutation({
    mutationFn: ({ productId, data }) => createReview(productId, data),
    onSuccess: (_, variables) => {
      const productId = variables?.productId;
      queryClient.invalidateQueries({ queryKey: shopQueryKeys.reviews(orgid, productId) });
      queryClient.invalidateQueries({ queryKey: shopQueryKeys.reviewSummary(orgid, productId) });
      queryClient.invalidateQueries({ queryKey: shopQueryKeys.allReviewsRoot(orgid) });
      queryClient.invalidateQueries({ queryKey: shopQueryKeys.dashboardOverview(orgid) });
    },
  });
};
