"use client"

import { TaskList, type TaskItem } from "@/components/task-list"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Period } from "@/lib/date"

type Group = {
  period: Period
  label: string
  title: string
  dateLabel: string
  placeholder: string
  emptyText: string
  tasks: TaskItem[]
}

export function PlannerTabs({ groups }: { groups: Group[] }) {
  return (
    <Tabs defaultValue="today" className="gap-4">
      <TabsList className="w-full md:w-fit">
        {groups.map((group) => (
          <TabsTrigger key={group.period} value={group.period} className="px-4">
            {group.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {groups.map((group) => (
        <TabsContent key={group.period} value={group.period}>
          <Card>
            <CardHeader>
              <CardTitle>{group.title}</CardTitle>
              <CardDescription>{group.dateLabel}</CardDescription>
            </CardHeader>
            <CardContent>
              <TaskList
                period={group.period}
                tasks={group.tasks}
                placeholder={group.placeholder}
                emptyText={group.emptyText}
              />
            </CardContent>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  )
}
