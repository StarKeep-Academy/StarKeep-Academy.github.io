"""
apps/common/pagination.py

Standard pagination that wraps results in the Starkeep envelope:
  { "data": [...], "meta": { "page", "page_size", "total" }, "errors": null }
"""

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response({
            "data": data,
            "meta": {
                "page": self.page.number,
                "page_size": self.get_page_size(self.request),
                "total": self.page.paginator.count,
            },
            "errors": None,
        })

    def get_paginated_response_schema(self, schema):
        return {
            "type": "object",
            "properties": {
                "data": schema,
                "meta": {
                    "type": "object",
                    "properties": {
                        "page": {"type": "integer"},
                        "page_size": {"type": "integer"},
                        "total": {"type": "integer"},
                    },
                },
                "errors": {"type": "null"},
            },
        }
