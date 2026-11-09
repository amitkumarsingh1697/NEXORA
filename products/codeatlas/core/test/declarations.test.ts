import { describe, expect, it } from 'vitest';
import { extractDeclarations } from '../src/indexer/extract/declarations';

const names = (lang: string, src: string) =>
  extractDeclarations(lang, src)?.declarations.map((d) => {
    const all = extractDeclarations(lang, src)?.declarations ?? [];
    const parent = d.parent !== undefined ? `${all[d.parent]?.name}.` : '';
    return `${d.kind}:${parent}${d.name}@${d.line}`;
  });
const imports = (lang: string, src: string) =>
  extractDeclarations(lang, src)?.imports.map((i) => i.spec);

describe('declaration extractor', () => {
  it('Java: classes, members, constructors, imports and package; ignores statements in bodies', () => {
    const src = `package com.acme.users;

import java.util.List;
import com.acme.db.UserRepository;

@Service
public class UserService extends Base implements Api {
    private final UserRepository repo;

    public UserService(UserRepository repo) {
        this.repo = repo;
    }

    public List<User> findAll(int limit) throws IOException {
        if (limit > 0) {
            return repo.findAll(limit);
        }
        return helper(limit);
    }

    interface Inner { void run(); }
}
`;
    const x = extractDeclarations('Java', src);
    expect(x?.namespace).toBe('com.acme.users');
    expect(imports('Java', src)).toEqual(['java.util.List', 'com.acme.db.UserRepository']);
    expect(names('Java', src)).toEqual([
      'class:UserService@7',
      'method:UserService.UserService@10',
      'method:UserService.findAll@14',
      'interface:UserService.Inner@21',
    ]);
    const find = x?.declarations.find((d) => d.name === 'findAll');
    expect(find).toMatchObject({ params: 'int limit', returns: 'List<User>', endLine: 19 });
  });

  it('Python: classes, methods by indentation, functions, relative and absolute imports', () => {
    const src = `import os, sys as system
from .models import User
from app.db import session

class Repo(Base):
    def get(self, id: int) -> User:
        return session.get(id)

    async def close(self):
        pass

def main(argv):
    Repo().get(1)
`;
    expect(names('Python', src)).toEqual([
      'class:Repo@5',
      'method:Repo.get@6',
      'method:Repo.close@9',
      'function:main@12',
    ]);
    expect(imports('Python', src)).toEqual(['os', 'sys', '.models', 'app.db']);
    expect(extractDeclarations('Python', src)?.declarations[1]).toMatchObject({
      params: 'self, id: int',
      returns: 'User',
    });
  });

  it('Go: structs, interfaces, functions, methods with receivers, import blocks', () => {
    const src = `package server

import (
\t"fmt"
\tapi "example.com/app/internal/api"
)

type Server struct {
\tport int
}

type Handler interface {
\tServe() error
}

func New(port int) *Server {
\treturn &Server{port: port}
}

func (s *Server) Start(ctx context.Context) error {
\treturn nil
}
`;
    const x = extractDeclarations('Go', src);
    expect(x?.namespace).toBe('server');
    expect(imports('Go', src)).toEqual(['fmt', 'example.com/app/internal/api']);
    expect(names('Go', src)).toEqual([
      'struct:Server@8',
      'interface:Handler@12',
      'function:New@16',
      'method:Start@20',
    ]);
    expect(x?.declarations[3]).toMatchObject({ receiver: 'Server', returns: 'error' });
  });

  it('C: functions in K&R and one-line style, structs, includes; skips prototypes', () => {
    const src = `#include "nvim/buffer.h"
#include <stdio.h>

static int helper(int x);

struct point {
  int x;
};

int
main(int argc, char **argv)
{
  return helper(argc);
}

static int helper(int x) {
  if (x) { return 1; }
  return 0;
}
`;
    expect(names('C', src)).toEqual(['struct:point@6', 'function:main@11', 'function:helper@16']);
    expect(imports('C', src)).toEqual(['nvim/buffer.h', 'stdio.h']);
  });

  it('C#: namespace, class, methods, using', () => {
    const src = `using System.Text;
namespace Shop.Orders
{
    public sealed class OrderService : IOrderService
    {
        public async Task<Order> GetAsync(Guid id)
        {
            return await _db.Find(id);
        }
    }
}
`;
    expect(names('C#', src)).toEqual(
      ['namespace:Orders@2', 'class:Orders.OrderService@4', 'method:OrderService.GetAsync@6'].map(
        (s) =>
          s
            .replace('namespace:Orders', 'namespace:Shop')
            .replace('Orders.OrderService', 'Shop.OrderService'),
      ),
    );
    expect(extractDeclarations('C#', src)?.namespace).toBe('Shop.Orders');
  });

  it('Kotlin, Swift, Rust, Ruby, Elixir, PHP', () => {
    expect(names('Kotlin', 'class A {\n  fun b(x: Int): String = ""\n}\nfun top() {}\n')).toEqual([
      'class:A@1',
      'method:A.b@2',
      'function:top@4',
    ]);
    expect(
      names('Swift', 'struct V: View {\n  func body(x: Int) -> Int {\n    return x\n  }\n}\n'),
    ).toEqual(['struct:V@1', 'method:V.body@2']);
    expect(
      names('Rust', 'pub struct S;\nimpl S {\n    pub fn new() -> Self { S }\n}\nfn main() {}\n'),
    ).toEqual(['struct:S@1', 'type:S@2', 'method:S.new@3', 'function:main@5']);
    expect(
      names(
        'Ruby',
        'module Billing\n  class Invoice < Base\n    def total(tax)\n    end\n  end\nend\n',
      ),
    ).toEqual(['module:Billing@1', 'class:Billing.Invoice@2', 'method:Invoice.total@3']);
    expect(
      names(
        'Elixir',
        'defmodule App.User do\n  def name(u), do: u.name\n  def name(_), do: nil\n  defp secret, do: 1\nend\n',
      ),
    ).toEqual(['module:App.User@1', 'function:App.User.name@2', 'function:App.User.secret@4']);
    expect(
      names('PHP', '<?php\nnamespace App;\nclass C {\n  public function run(int $x): void {}\n}\n'),
    ).toEqual(['class:C@3', 'method:C.run@4']);
  });

  it('legacy and uncommon languages: COBOL, Fortran, JCL, Erlang, Haskell, Pascal, VB.NET, PowerShell, Shell, Lua', () => {
    const cobol = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. PAYROLL.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       COPY EMPREC.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM CALC-PAY.
           CALL 'TAXCALC'.
           STOP RUN.
       CALC-PAY.
           DISPLAY 'X'.
`;
    expect(names('COBOL', cobol)).toEqual([
      'module:PAYROLL@2',
      'paragraph:MAIN-PARA@7',
      'paragraph:CALC-PAY@11',
    ]);
    expect(imports('COBOL', cobol)).toEqual(['EMPREC', 'TAXCALC']);
    expect(
      names(
        'Fortran Free Form',
        'module solver\ncontains\n  pure function f(x) result(y)\n  end function\nend module solver\nprogram main\n  use solver\nend program\n',
      ),
    ).toEqual(['module:solver@1', 'procedure:solver.f@3', 'module:main@6']);
    expect(names('JCL', '//PAYJOB   JOB (ACCT),CLASS=A\n//STEP1    EXEC PGM=PAYROLL\n')).toEqual([
      'module:PAYJOB@1',
      'procedure:STEP1@2',
    ]);
    expect(imports('JCL', '//STEP1    EXEC PGM=PAYROLL\n')).toEqual(['PAYROLL']);
    expect(
      names('Erlang', '-module(cache).\nget(K) -> ok;\nget(_) -> none.\nput(K, V) ->\n  ok.\n'),
    ).toEqual(['module:cache@1', 'function:get@2', 'function:put@4']);
    expect(
      names(
        'Haskell',
        'module Data.Stack where\nimport qualified Data.Map as M\ndata Stack a = Stack [a]\npush :: a -> Stack a -> Stack a\npush x (Stack xs) = Stack (x:xs)\n',
      ),
    ).toEqual(['module:Data.Stack@1', 'class:Stack@3', 'function:push@4']);
    expect(
      names(
        'Pascal',
        'unit Shapes;\ninterface\nuses SysUtils, Math;\ntype\n  TShape = class\n  end;\nprocedure Draw(s: TShape);\n',
      ),
    ).toEqual(['module:Shapes@1', 'class:TShape@5', 'procedure:Draw@7']);
    expect(imports('Pascal', 'uses SysUtils, Math;\n')).toEqual(['SysUtils', 'Math']);
    expect(
      names(
        'Visual Basic .NET',
        'Public Class Calc\n  Public Function Add(a As Integer) As Integer\n  End Function\nEnd Class\n',
      ),
    ).toEqual(['class:Calc@1', 'method:Calc.Add@2']);
    expect(
      names(
        'PowerShell',
        'function Get-Thing {\n  param($x)\n}\nclass Box {\n  [string] Name() { return "" }\n}\n',
      ),
    ).toEqual(['function:Get-Thing@1', 'class:Box@4', 'method:Box.Name@5']);
    expect(names('Shell', 'usage() {\n  echo hi\n}\nfunction deploy {\n  :\n}\n')).toEqual([
      'function:usage@1',
      'function:deploy@4',
    ]);
    expect(imports('Shell', 'source ./lib/common.sh\n. "$DIR/env.sh"\n')).toEqual([
      './lib/common.sh',
      'env.sh',
    ]);
    expect(
      names('Lua', 'local M = {}\nfunction M.setup(opts)\nend\nlocal function helper(x) end\n'),
    ).toEqual(['function:M.setup@2', 'function:helper@4']);
    expect(imports('Lua', 'local api = require("vim.api")\n')).toEqual(['vim.api']);
  });

  it('returns null for languages without rules (they stay text only)', () => {
    expect(extractDeclarations('Brainfuck', '+++')).toBeNull();
  });
});
