'use client';

import { useState, useTransition } from 'react';
import { MoreVertical, Pencil, Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { setCustomerStatus } from '@/app/(dashboard)/customers/actions';
import { CustomerFormDialog, type CustomerItem } from './customer-form-dialog';

interface Props {
  customer: CustomerItem & { status: string };
  businessUnits: { id: string; code: string; name: string }[];
}

export function CustomerRowActions({ customer, businessUnits }: Props) {
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const isActive = customer.status === 'active';

  function toggle() {
    startTransition(async () => {
      const r = await setCustomerStatus(customer.id, isActive ? 'inactive' : 'active');
      if (r.ok) toast.success(isActive ? 'Deactivated' : 'Reactivated');
      else toast.error(r.error);
    });
  }

  return (
    <>
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" disabled={pending}>
                <MoreVertical className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTimeout(() => setEditOpen(true))}>
              <Pencil className="size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {isActive ? (
              <DropdownMenuItem variant="destructive" onClick={toggle}>
                <PowerOff className="size-4" />
                Deactivate
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={toggle}>
                <Power className="size-4" />
                Reactivate
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CustomerFormDialog
        mode="edit"
        customer={customer}
        businessUnits={businessUnits}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}
